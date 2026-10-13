#!/usr/bin/env python3
"""Build data.js for the playground from the real KYC risk engine.

The page does not invent scores. This script runs every synthetic customer through the
Python engine, records each factor score, the signals the safety rules look at, and the
engine's own answer at default settings. The web page re-weights those factor scores in the
browser, and a test checks that the browser logic gives the same answer as the engine.

Usage:
    python tools/export_data.py            write data.js
    python tools/export_data.py --check    fail if data.js is out of date
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLAYGROUND = HERE.parent
ENGINE_DIR = PLAYGROUND.parent / "kyc-risk-engine"
sys.path.insert(0, str(ENGINE_DIR / "src"))

from kyc_risk_engine import Customer, RiskEngine  # noqa: E402
from kyc_risk_engine.config import load_config  # noqa: E402
from kyc_risk_engine.connectors import (  # noqa: E402
    CountryRiskSource,
    MockCryptoExposureSource,
    MockIdentitySource,
    MockScreeningSource,
)

SEED = 42
GENERATED_COUNT = 292  # plus 8 hand-made examples = 300

FACTOR_LABELS = {
    "geography": "Country",
    "screening": "Watchlists and news",
    "product": "Product",
    "channel": "How they signed up",
    "identity": "Identity check",
    "crypto_exposure": "Crypto wallet history",
    "customer_profile": "Customer profile",
}

STORIES = {
    "C001": "Salaried in Denmark, signed up in person, ordinary bank account. Nothing raises the risk.",
    "C002": "Salaried in Germany, buys crypto, very little risky wallet history. Low.",
    "C003": "Self-employed in Germany with Nigerian ties, sends crypto abroad, no proof of where the money comes from. Two factors are elevated, so the band is medium.",
    "C004": "Matches a foreign politically exposed person on the watchlist. The weighted score stays modest, so a rule lifts the band to high.",
    "C005": "Confirmed sanctions match and exposure to a mixing service (a service that hides where crypto came from). Blocked.",
    "C006": "Cash-heavy business, no liveness check, sends crypto out. Several moderate risks together.",
    "C007": "Student in Denmark. The identity provider timed out, so a required check is missing and a person must review.",
    "C008": "Name is close to a sanctioned name but the birth date differs. An analyst has to confirm.",
}

COUNTRY_NAMES = {
    "DK": "Denmark", "DE": "Germany", "PL": "Poland", "GB": "the United Kingdom", "SE": "Sweden",
    "NL": "the Netherlands", "IL": "Israel", "AE": "the United Arab Emirates", "TR": "Turkey",
    "NG": "Nigeria", "RU": "Russia", "MM": "Myanmar", "IR": "Iran", "KP": "North Korea",
}
OCCUPATION_PHRASES = {
    "salaried_employee": "Salaried employee", "student": "Student", "unemployed": "Unemployed",
    "self_employed": "Self-employed", "crypto_trader": "Crypto trader",
    "cash_intensive_business": "Cash-heavy business owner", "unknown": "Occupation unknown",
}
PRODUCT_PHRASES = {
    "retail_fiat": "bank account only", "crypto_buy_sell": "buys and sells crypto",
    "crypto_transfer_out": "sends crypto out", "crypto_otc": "large private crypto trades",
}

FIRST = ["Alma", "Noor", "Mikkel", "Ida", "Tomas", "Leila", "Jonas", "Elin", "Pavel", "Sana", "Oskar",
         "Mette", "Rafael", "Yara", "Henrik", "Zofia", "Daniel", "Amira", "Lars", "Chiara", "Emil",
         "Selma", "Karim", "Birgit", "Anton", "Nadia", "Viggo", "Hana", "Soren", "Tilda"]
LAST = ["Andersen", "Krol", "Haddad", "Lund", "Berg", "Nowak", "Demir", "Falk", "Okafor", "Vester",
        "Ruiz", "Strand", "Cohen", "Moller", "Petrov", "Aydin", "Holm", "Zielinski", "Adeyemi",
        "Winter", "Kvist", "Marin", "Bakker", "Sorensen", "Ibrahim", "Eriksson", "Novak", "Dahl"]

# Weighted pools: countries a customer might live in or send money to.
COUNTRY_POOL = [("DK", 22), ("DE", 14), ("SE", 8), ("NL", 6), ("PL", 8), ("GB", 10), ("IL", 6),
                ("AE", 5), ("TR", 5), ("NG", 4), ("RU", 2), ("MM", 0.6), ("IR", 0.5), ("KP", 0.2)]
OCCUPATION_POOL = [("salaried_employee", 46), ("self_employed", 18), ("student", 10), ("unemployed", 5),
                   ("crypto_trader", 9), ("cash_intensive_business", 6), ("unknown", 6)]
CHANNEL_POOL = [("face_to_face", 15), ("remote_with_liveness", 70), ("remote_no_liveness", 15)]
PRODUCT_POOL = [("retail_fiat", 20), ("crypto_buy_sell", 50), ("crypto_transfer_out", 20), ("crypto_otc", 10)]

# Extra watchlist-style customers so the sample shows every screening outcome.
SPECIAL = [
    {"name": "Jonas Halvorsen", "dob": "1958-01-30", "residence": "DK", "nationality": "DK"},
    {"name": "Anselm Karrow", "dob": "1983-06-11", "residence": "SE", "nationality": "SE"},
    {"name": "Anselm Karow", "dob": "1990-01-01", "residence": "PL", "nationality": "PL"},
    {"name": "Marta Ellingsen Okoye", "dob": "1964-09-18", "residence": "NL", "nationality": "NG"},
    {"name": "Viktor Brenagan", "dob": "1971-03-02", "residence": "TR", "nationality": "RU"},
    {"name": "Victor Brennagan", "dob": "1999-12-12", "residence": "DE", "nationality": "DE"},
]


def pick(rng: random.Random, pool):
    items, weights = zip(*pool)
    return rng.choices(items, weights=weights, k=1)[0]


def make_generated(rng: random.Random):
    """Return (customers, fixtures) for the generated population. All data is invented."""
    customers: list[Customer] = []
    fixtures: dict = {}
    total = GENERATED_COUNT
    for i in range(total):
        cid = f"C{101 + i}"
        special = SPECIAL[i] if i < len(SPECIAL) else None
        name = special["name"] if special else f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        dob = special["dob"] if special else f"{rng.randint(1950, 2004)}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}"
        residence = special["residence"] if special else pick(rng, COUNTRY_POOL)
        nationality = special["nationality"] if special else (residence if rng.random() < 0.8 else pick(rng, COUNTRY_POOL))
        occupation = pick(rng, OCCUPATION_POOL)
        channel = pick(rng, CHANNEL_POOL)
        product = pick(rng, PRODUCT_POOL)
        volume = round(min(250000, rng.lognormvariate(7.4, 1.1)), -1)
        crypto = product != "retail_fiat"
        counterparties = tuple(pick(rng, COUNTRY_POOL) for _ in range(rng.choice([0, 0, 1, 2]))) if product in ("crypto_transfer_out", "crypto_otc") else ()
        wallets = tuple(f"demo_wallet_{cid.lower()}_{k}" for k in range(rng.choice([1, 1, 2]))) if crypto else ()
        customers.append(Customer(
            customer_id=cid, full_name=name, date_of_birth=dob, nationality=nationality,
            residence_country=residence, occupation=occupation, onboarding_channel=channel,
            product=product, expected_monthly_volume_eur=volume,
            source_of_funds_documented=rng.random() < 0.7,
            counterparty_countries=counterparties, wallet_addresses=wallets,
        ))

        ident: dict
        if rng.random() < 0.03:
            ident = {"simulate_outage": True}
        else:
            liveness = None if channel == "remote_no_liveness" else (False if rng.random() < 0.03 else True)
            face = min(0.995, max(0.55, rng.betavariate(18, 1.4)))
            ident = {"document_authentic": rng.random() > 0.015, "liveness_passed": liveness,
                     "face_match": round(face, 2)}
        fixtures[cid] = {"identity": ident}
        if crypto and rng.random() > 0.015:  # a few wallet analytics outages
            pct = min(70.0, round(rng.expovariate(1 / 5.0), 1))
            fixtures[cid]["crypto"] = {"high_risk_exposure_pct": pct, "mixer_exposure": rng.random() < 0.015}
    return customers, fixtures


def summary_for(c: Customer) -> str:
    place = COUNTRY_NAMES.get(c.residence_country, c.residence_country)
    return f"{OCCUPATION_PHRASES[c.occupation]} in {place}, {PRODUCT_PHRASES[c.product]}"


def signals_from(data, cfg) -> dict:
    """The facts the safety rules look at, taken from the raw source results."""
    sig = {"sanctionsConfirmed": False, "sanctionsPotential": False, "pepForeign": False,
           "callForAction": [], "documentFailed": False, "mixer": False}
    t = cfg["screening"]
    s = data.get("screening")
    if s and s.ok:
        conf, kind = s.signals["match_confidence"], s.signals["list"]
        confirmed = conf >= t["confirmed_match_from"]
        potential = conf >= t["potential_match_from"]
        sig["sanctionsConfirmed"] = kind == "sanctions" and confirmed
        sig["sanctionsPotential"] = kind == "sanctions" and potential and not confirmed
        sig["pepForeign"] = kind == "pep_foreign" and potential
    g = data.get("country_risk")
    if g and g.ok:
        sig["callForAction"] = list(g.signals["call_for_action"])
    i = data.get("identity")
    if i and i.ok:
        sig["documentFailed"] = not i.signals["document_authentic"]
    c = data.get("crypto_exposure")
    if c and c.ok:
        sig["mixer"] = bool(c.signals.get("mixer_exposure"))
    return sig


def build() -> dict:
    cfg = load_config()
    hand_customers = [
        Customer.from_dict(d)
        for d in json.loads((ENGINE_DIR / "data" / "synthetic_customers.json").read_text(encoding="utf-8"))
    ]
    fixtures = json.loads((ENGINE_DIR / "data" / "mock_source_data.json").read_text(encoding="utf-8"))
    rng = random.Random(SEED)
    generated, generated_fixtures = make_generated(rng)
    fixtures.update(generated_fixtures)

    engine = RiskEngine(
        config=cfg,
        sources=[CountryRiskSource(cfg), MockScreeningSource(),
                 MockIdentitySource(fixtures), MockCryptoExposureSource(fixtures)],
    )

    rows = []
    for c in hand_customers + generated:
        factors, data = engine.collect(c)
        result = engine.assess(c)
        row = {
            "id": c.customer_id,
            "summary": summary_for(c),
            "f": {f.name: {"score": f.score, "ok": f.data_available, "why": f.evidence} for f in factors},
            "sig": signals_from(data, cfg),
            "engine": {"score": result.score, "band": result.band.value, "review": result.needs_manual_review,
                       "overrides": result.overrides_applied},
        }
        if c.customer_id in STORIES:
            row["story"] = STORIES[c.customer_id]
        rows.append(row)

    return {
        "meta": {
            "seed": SEED,
            "customerCount": len(rows),
            "engineConfigVersion": cfg.version,
            "note": "All customers are synthetic. Names are used only to exercise watchlist matching and are not exported.",
        },
        "factors": [{"key": k, "label": FACTOR_LABELS[k], "defaultWeight": cfg.weights[k]} for k in FACTOR_LABELS],
        "defaults": {
            "medium": cfg["bands"]["medium_from"],
            "high": cfg["bands"]["high_from"],
            "elevatedFrom": cfg["compounding"]["elevated_from"],
            "mediumIfAtLeast": cfg["compounding"]["medium_if_at_least"],
            "highIfAtLeast": cfg["compounding"]["high_if_at_least"],
            "maxMissingWeight": cfg["max_missing_weight_before_review"],
            "requiredFactors": cfg["required_factors"],
        },
        "customers": rows,
    }


def render(payload: dict) -> str:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return ("// Generated by tools/export_data.py. Do not edit by hand.\n"
            f"globalThis.PLAYGROUND_DATA = {body};\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="exit 1 if data.js is out of date")
    args = ap.parse_args()
    text = render(build())
    target = PLAYGROUND / "data.js"
    if args.check:
        if not target.exists() or target.read_text(encoding="utf-8") != text:
            print("data.js is out of date. Run: python tools/export_data.py")
            return 1
        print("data.js is up to date")
        return 0
    target.write_text(text, encoding="utf-8")
    print(f"Wrote {target.name}: {len(text) / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
