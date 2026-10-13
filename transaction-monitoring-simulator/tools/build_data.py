#!/usr/bin/env python3
"""Build data.js and tests/expected.json for the transaction monitoring simulator.

The data is synthetic. 400 invented customers make payments over 30 days. 28 of them are
"real problems": they follow a money laundering pattern that the generator planted. The other 372
behave in ways that are unusual but innocent (a car purchase, an active trader, a family
remittance). The page lets a visitor set alert rules and see which group each rule catches.

Country risk scores come from the KYC risk engine's config, so both projects agree.

Usage:
    python tools/build_data.py            write data.js and tests/expected.json
    python tools/build_data.py --check    fail if either file is out of date
"""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT.parent / "kyc-risk-engine" / "src"))

import reference_rules as ref  # noqa: E402
from kyc_risk_engine.config import load_config  # noqa: E402

SEED = 7
DAYS = 30
DAY = 1440

COUNTRY_NAMES = {
    "DK": "Denmark", "DE": "Germany", "PL": "Poland", "GB": "the United Kingdom", "SE": "Sweden",
    "NL": "the Netherlands", "IL": "Israel", "AE": "the United Arab Emirates", "TR": "Turkey",
    "NG": "Nigeria", "RU": "Russia", "MM": "Myanmar", "IR": "Iran", "KP": "North Korea",
}
ASSETS = ["EUR", "BTC", "ETH", "USDT"]

# How many customers follow each pattern. Real problems first.
PATTERNS = {
    # key: (count, is_real_problem, short label)
    "structuring": (6, True, "Splitting a large sum into payments just under a limit"),
    "passThrough": (6, True, "Money in and straight back out"),
    "corridor": (5, True, "Small, steady payments to high-risk countries"),
    "mixing": (4, True, "Payments to wallets linked to a mixing service"),
    "dormantSpike": (4, True, "Quiet account that suddenly moves money"),
    "rapidFire": (4, True, "Many small payments in one day"),
    "stealth": (3, True, "Many small payments, nothing that stands out"),
    "everyday": (234, False, "Everyday spending"),
    "trader": (30, False, "Active crypto trader"),
    "bigPurchase": (20, False, "One large purchase"),
    "family": (32, False, "Sends money to family abroad"),
    "freelancer": (20, False, "Freelancer paid in, pays contractors out"),
    "supplier": (5, False, "Small business paying suppliers"),
    "oneOff": (12, False, "One unusually big spend"),
    "privacy": (5, False, "Privacy-minded crypto user"),
    "burst": (10, False, "One very busy day"),
}

BAND_PROBS = {
    True: [("low", 0.35), ("medium", 0.30), ("high", 0.30), ("blocked", 0.05)],
    False: [("low", 0.80), ("medium", 0.13), ("high", 0.06), ("blocked", 0.01)],
}

DOMESTIC = [("DK", 50), ("DE", 12), ("SE", 8), ("NL", 6), ("PL", 8), ("GB", 10)]
EU_ONLY = [("DE", 30), ("NL", 20), ("SE", 20), ("PL", 15), ("DK", 15)]
FAMILY_ABROAD = [("NG", 3), ("TR", 3), ("AE", 2), ("IL", 2), ("RU", 1.5), ("MM", 0.5)]
WALLET_COUNTRIES = [("AE", 3), ("TR", 3), ("NG", 2), ("DE", 2), ("NL", 2)]
RISKY = [("RU", 3), ("MM", 1), ("IR", 1), ("NG", 3), ("KP", 0.3)]


def pick(rng, pool):
    items, weights = zip(*pool)
    return rng.choices(items, weights=weights, k=1)[0]


def euro(n):
    return f"{int(round(n)):,} EUR"


class Builder:
    """Collects one customer's payments, then sorts them by time."""

    def __init__(self, rng):
        self.rng = rng
        self.pays: list[list[int]] = []

    def add(self, minute, direction, amount, cc, asset=0, mixer=0):
        minute = max(0, min(DAYS * DAY - 1, int(minute)))
        self.pays.append([minute, direction, max(1, int(round(amount))), cc, asset, mixer])

    def at(self, day, hour):
        return day * DAY + int(hour * 60)

    def random_time(self):
        return self.at(self.rng.randint(0, DAYS - 1), self.rng.uniform(7, 23))

    def asset(self, crypto_share=0.3):
        if self.rng.random() < crypto_share:
            return self.rng.choice([1, 2, 3, 3])
        return 0


def everyday(b: Builder, rng, with_salary=True, n=None, typical=None, risky_share=0.03):
    """Ordinary spending. Returns the customer's usual payment size."""
    typical = typical or math.exp(rng.gauss(math.log(45), 0.55))
    n = n or rng.randint(5, 24)
    for _ in range(n):
        direction = 0 if rng.random() < 0.12 else 1
        amount = min(1800, max(4, rng.lognormvariate(math.log(typical), 0.7)))
        cc = pick(rng, DOMESTIC)
        if rng.random() < risky_share:
            cc = pick(rng, [("TR", 3), ("AE", 2), ("NG", 1), ("IL", 1)])
            amount = min(amount, 250)
        b.add(b.random_time(), direction, amount, cc, b.asset())
    if with_salary and rng.random() < 0.6:
        b.add(b.at(rng.randint(0, 28), 8), 0, rng.uniform(1800, 4800), "DK" if rng.random() < 0.7 else "DE")
    return typical


def make_customer(pattern, rng):
    b = Builder(rng)
    story = ""

    if pattern == "everyday":
        everyday(b, rng)
        story = "Ordinary spending and a salary. Nothing here is wrong."

    elif pattern == "trader":
        everyday(b, rng, with_salary=False, n=rng.randint(3, 8))
        for day in rng.sample(range(DAYS), rng.randint(4, 9)):
            for _ in range(rng.randint(5, 14)):
                amount = rng.lognormvariate(math.log(500), 0.9)
                if rng.random() < 0.06:
                    amount = rng.uniform(5500, 12000)
                b.add(b.at(day, rng.uniform(8, 22)), rng.randint(0, 1), min(amount, 15000), pick(rng, EU_ONLY), rng.choice([1, 2, 3]))
        story = "Buys and sells crypto on several days. Busy days and some large trades are normal for this person."

    elif pattern == "bigPurchase":
        everyday(b, rng)
        amount = rng.uniform(8000, 45000)
        b.add(b.random_time(), 1, amount, pick(rng, DOMESTIC))
        story = f"Paid {euro(amount)} for a car or a home deposit. One large payment, nothing else unusual."

    elif pattern == "family":
        everyday(b, rng, risky_share=0)
        countries = []
        for _ in range(rng.randint(2, 5)):
            cc = pick(rng, FAMILY_ABROAD)
            countries.append(cc)
            b.add(b.random_time(), 1, rng.uniform(80, 700), cc, b.asset(0.4))
        story = f"Sends small amounts to family in {COUNTRY_NAMES[countries[0]]}. A risky country on paper, an ordinary reason in practice."

    elif pattern == "freelancer":
        everyday(b, rng)
        for _ in range(rng.randint(1, 3)):
            t = b.at(rng.randint(0, 26), rng.uniform(8, 16))
            invoice = rng.uniform(3000, 20000)
            b.add(t, 0, invoice, pick(rng, [("DE", 3), ("NL", 2), ("GB", 2), ("AE", 1)]))
            paid = invoice * rng.uniform(0.80, 0.98)
            parts = rng.randint(1, 3)
            for k in range(parts):
                b.add(t + rng.randint(60, 30 * 60), 1, paid / parts, pick(rng, [("DE", 2), ("PL", 2), ("TR", 1)]), b.asset(0.3))
        story = "A client pays an invoice and the freelancer passes most of it to contractors within a day. Looks like money passing through, but it is normal business."

    elif pattern == "supplier":
        everyday(b, rng, n=rng.randint(4, 10))
        start = rng.randint(0, 20)
        for k in range(rng.randint(3, 5)):
            b.add(b.at(start + k, rng.uniform(9, 15)), 1, rng.uniform(9100, 9900), pick(rng, EU_ONLY))
        story = "A small firm pays three or four supplier invoices in one week. Each one happens to be just under 10,000 EUR."

    elif pattern == "oneOff":
        typical = everyday(b, rng)
        amount = max(600, min(2600, typical * rng.uniform(14, 30)))
        b.add(b.random_time(), 1, amount, pick(rng, DOMESTIC))
        story = f"Spent {euro(amount)} on one purchase, many times their usual payment. A laptop or a holiday, not a crime."

    elif pattern == "privacy":
        everyday(b, rng)
        for _ in range(rng.randint(1, 2)):
            b.add(b.random_time(), 1, rng.uniform(40, 400), pick(rng, EU_ONLY), rng.choice([1, 3]), mixer=1)
        story = "Sent a small amount to a wallet that analytics link to a mixing service. Many people do this for privacy, not crime."

    elif pattern == "burst":
        everyday(b, rng)
        day = rng.randint(1, 28)
        n = rng.randint(9, 16)
        for _ in range(n):
            b.add(b.at(day, rng.uniform(9, 22)), 1, rng.uniform(8, 90), pick(rng, DOMESTIC))
        story = f"Made {n} small payments in a single day, for example festival tickets or splitting a bill. Busy, not suspicious."

    elif pattern == "structuring":
        everyday(b, rng, n=rng.randint(3, 8), with_salary=False)
        start = rng.randint(0, 22)
        n = rng.randint(4, 7)
        span = rng.randint(2, 6)
        total = 0
        for k in range(n):
            amount = rng.uniform(9100, 9900)
            total += amount
            b.add(b.at(start + (k * span) // max(1, n - 1), rng.uniform(9, 20)), 1, amount,
                  pick(rng, [("DE", 2), ("PL", 2), ("TR", 2), ("AE", 1)]), rng.choice([1, 2, 3]))
        story = f"Sent {euro(total)} in {n} payments of about 9,000 to 9,900 EUR within {span} days, each just under a 10,000 EUR limit. A classic way to dodge reporting."

    elif pattern == "passThrough":
        everyday(b, rng, n=rng.randint(3, 8), with_salary=False)
        small = len(b.pays) % 3 == 0 or rng.random() < 0.34
        t = b.at(rng.randint(0, 25), rng.uniform(8, 18))
        incoming = rng.uniform(3000, 4400) if small else rng.uniform(14000, 60000)
        hours = rng.uniform(5, 20) if small or rng.random() < 0.65 else rng.uniform(30, 60)
        b.add(t, 0, incoming, pick(rng, [("DE", 2), ("NL", 2), ("GB", 2), ("AE", 1)]))
        sent = incoming * rng.uniform(0.93, 0.99)
        parts = rng.randint(1, 2)
        for k in range(parts):
            b.add(t + int(hours * 60) - k * 90, 1, sent / parts, pick(rng, WALLET_COUNTRIES), rng.choice([1, 2, 3]))
        story = f"Received {euro(incoming)} and sent {euro(sent)} on within about {hours:.0f} hours. The account is used as a pipe, not a place to hold money."

    elif pattern == "corridor":
        everyday(b, rng, n=rng.randint(4, 10), with_salary=False, risky_share=0)
        n = rng.randint(4, 9)
        for _ in range(n):
            b.add(b.random_time(), 1, rng.uniform(400, 2400), pick(rng, RISKY), rng.choice([0, 1, 3]))
        story = f"{n} payments of 400 to 2,400 EUR to countries with weak controls. Each one is small, so only the destination gives it away."

    elif pattern == "mixing":
        everyday(b, rng, n=rng.randint(3, 8), with_salary=False, risky_share=0)
        for _ in range(rng.randint(3, 6)):
            b.add(b.random_time(), 1, rng.uniform(300, 3500), pick(rng, EU_ONLY), rng.choice([1, 2]), mixer=1)
        story = "Repeated payments to wallets linked to a mixing service, which hides where crypto came from."

    elif pattern == "dormantSpike":
        typical = math.exp(rng.gauss(math.log(25), 0.3))
        everyday(b, rng, n=rng.randint(3, 6), typical=typical, with_salary=False, risky_share=0)
        for _ in range(rng.randint(1, 2)):
            amount = rng.uniform(2500, 4200)
            b.add(b.random_time(), 1, amount, pick(rng, WALLET_COUNTRIES), rng.choice([1, 2, 3]))
        story = "A quiet account that normally moves tens of euros suddenly sends thousands. Could be a taken-over account or a mule account (one lent out to move other people's money)."

    elif pattern == "rapidFire":
        everyday(b, rng, n=rng.randint(3, 8), with_salary=False)
        day = rng.randint(1, 28)
        n = rng.randint(10, 16)
        total = 0
        for _ in range(n):
            amount = rng.uniform(600, 990)
            total += amount
            b.add(b.at(day, rng.uniform(8, 22)), 1, amount, pick(rng, WALLET_COUNTRIES + [("DE", 3), ("NL", 3)]), rng.choice([1, 2, 3]))
        story = f"Sent {euro(total)} in {n} payments of 600 to 990 EUR on a single day, so that no one payment looks large."

    elif pattern == "stealth":
        n = rng.randint(25, 40)
        for _ in range(n):
            b.add(b.random_time(), rng.choice([0, 1, 1]), rng.uniform(150, 900), pick(rng, EU_ONLY), rng.choice([1, 2, 3]))
        story = f"{n} payments of 150 to 900 EUR to and from many wallets in ordinary countries. No single payment, day or country stands out, so none of these rules sees it."

    else:  # pragma: no cover
        raise ValueError(pattern)

    b.pays.sort()
    amounts = [p[2] for p in b.pays]
    typical_size = int(round(statistics.median(amounts)))
    real = PATTERNS[pattern][1]
    band = pick(rng, BAND_PROBS[real])
    return {"band": band, "typical": typical_size, "real": real, "pattern": pattern, "story": story, "p": b.pays}


def generate():
    rng = random.Random(SEED)
    customers = []
    for pattern, (count, _, _) in PATTERNS.items():
        for _ in range(count):
            customers.append(make_customer(pattern, rng))
    rng.shuffle(customers)
    for i, c in enumerate(customers, start=1):
        c["id"] = f"P{i:03d}"
    return customers


def build():
    cfg = load_config()
    scores = dict(cfg["country_risk"]["scores"])
    customers = generate()
    used = sorted({p[3] for c in customers for p in c["p"]}, key=lambda cc: (scores[cc], cc))
    payload = {
        "meta": {
            "seed": SEED,
            "days": DAYS,
            "customerCount": len(customers),
            "realCount": sum(1 for c in customers if c["real"]),
            "engineConfigVersion": cfg.version,
            "note": "All customers and payments are synthetic. The real problems are planted by the generator.",
        },
        "countries": {cc: {"name": COUNTRY_NAMES[cc], "score": scores[cc]} for cc in used},
        "assets": ASSETS,
        "patterns": {k: {"label": v[2], "real": v[1]} for k, v in PATTERNS.items()},
        "customers": [
            {k: c[k] for k in ("id", "band", "typical", "real", "pattern", "story", "p")}
            for c in sorted(customers, key=lambda c: c["id"])
        ],
    }
    return payload, scores


def expected(payload, scores):
    """What the reference rules flag for every rule, level and tighten setting."""
    custs = payload["customers"]
    out = {"levels": ref.LEVELS, "defaultLevel": ref.DEFAULT_LEVEL, "single": {}, "defaultTriggers": {}}
    for key in ref.RULE_KEYS:
        for level in range(len(ref.LEVELS[key])):
            for tighten in (False, True):
                ids = [c["id"] for c in custs if ref.triggers(c, key, level, tighten, scores)]
                out["single"][f"{key}:{level}:{int(tighten)}"] = ids
    settings = ref.default_settings()
    out["defaultFlagged"] = ref.flagged_ids(custs, settings, scores)
    for c in custs:
        for key in ref.RULE_KEYS:
            hit = ref.triggers(c, key, ref.DEFAULT_LEVEL[key], False, scores)
            if hit:
                out["defaultTriggers"][f"{c['id']}:{key}"] = hit
    return out


def render_js(payload):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return ("// Generated by tools/build_data.py. Do not edit by hand.\n"
            f"globalThis.MONITOR_DATA = {body};\n")


def render_expected(exp):
    return json.dumps(exp, separators=(",", ":"), sort_keys=True) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="exit 1 if the generated files are out of date")
    args = ap.parse_args()
    payload, scores = build()
    files = {ROOT / "data.js": render_js(payload),
             ROOT / "tests" / "expected.json": render_expected(expected(payload, scores))}
    stale = False
    for path, text in files.items():
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                print(f"{path.name} is out of date. Run: python tools/build_data.py")
                stale = True
        else:
            path.write_text(text, encoding="utf-8")
            print(f"Wrote {path.name}: {len(text) / 1024:.0f} KB")
    if args.check and not stale:
        print("generated files are up to date")
    return 1 if stale else 0


if __name__ == "__main__":
    raise SystemExit(main())
