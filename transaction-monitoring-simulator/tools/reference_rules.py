"""Reference version of the seven alert rules, in plain Python.

The web page has its own copy of these rules in monitor.js. A test compares the two on every
rule, every setting and every customer, so the page cannot drift from this file.

Payment format (the same as in data.js): [minute, direction, amount_eur, country, asset, mixer]
  minute     whole minutes since the start of the 30 day window
  direction  0 = money in, 1 = money out
  asset      0 = euro bank payment, 1 = Bitcoin, 2 = Ether, 3 = Tether stablecoin
  mixer      1 when the other side is linked to a mixing service (a service that hides where crypto came from)

Every rule returns the positions of the payments that triggered it. An empty list means no alert.
"""

from __future__ import annotations

import math

MINUTES_PER_DAY = 1440
WEEK = 7 * MINUTES_PER_DAY
LIMIT = 10_000          # the reporting level that "just under" is measured against
JUST_UNDER_FROM = 9_000  # 10 percent below the limit
PASS_THROUGH_MIN_IN = 2_000
PASS_THROUGH_SHARE_PERCENT = 90
SPIKE_MIN_AMOUNT = 500
HIGH_BANDS = ("high", "blocked")

# The settings a visitor can choose from. Index 0 is the loosest setting.
LEVELS = {
    "large": [1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000],
    "many": [3, 4, 5, 6, 8, 10, 12, 15, 20, 30],
    "country": [25, 45, 60, 85, 90, 100],
    "justUnder": [2, 3, 4, 5, 6],
    "passThrough": [72, 48, 24, 12, 6, 2],
    "spike": [3, 5, 8, 10, 15, 25, 40],
    "mixer": [1],
}
DEFAULT_LEVEL = {"large": 3, "many": 4, "country": 2, "justUnder": 1, "passThrough": 2, "spike": 3, "mixer": 0}
RULE_KEYS = list(LEVELS)


def _is_high(customer) -> bool:
    return customer["band"] in HIGH_BANDS


def large(customer, level, tighten, scores):
    limit = LEVELS["large"][level]
    if tighten and _is_high(customer):
        limit = limit / 2
    return [i for i, p in enumerate(customer["p"]) if p[2] >= limit]


def many(customer, level, tighten, scores):
    n = LEVELS["many"][level]
    if tighten and _is_high(customer):
        n = max(2, math.ceil(n / 2))
    by_day: dict[int, list[int]] = {}
    for i, p in enumerate(customer["p"]):
        by_day.setdefault(p[0] // MINUTES_PER_DAY, []).append(i)
    out: list[int] = []
    for day in sorted(by_day):
        if len(by_day[day]) >= n:
            out.extend(by_day[day])
    return out


def country(customer, level, tighten, scores):
    floor = LEVELS["country"][level]
    return [i for i, p in enumerate(customer["p"]) if scores[p[3]] >= floor]


def just_under(customer, level, tighten, scores):
    k = LEVELS["justUnder"][level]
    band = [i for i, p in enumerate(customer["p"]) if JUST_UNDER_FROM <= p[2] < LIMIT]
    hit: set[int] = set()
    for a in range(len(band)):
        start = customer["p"][band[a]][0]
        window = [band[b] for b in range(a, len(band)) if customer["p"][band[b]][0] - start < WEEK]
        if len(window) >= k:
            hit.update(window)
    return sorted(hit)


def pass_through(customer, level, tighten, scores):
    window = LEVELS["passThrough"][level] * 60
    hit: set[int] = set()
    pays = customer["p"]
    for i, p in enumerate(pays):
        if p[1] != 0 or p[2] < PASS_THROUGH_MIN_IN:
            continue
        outs = [j for j, q in enumerate(pays) if q[1] == 1 and p[0] < q[0] <= p[0] + window]
        if sum(pays[j][2] for j in outs) * 100 >= p[2] * PASS_THROUGH_SHARE_PERCENT:
            hit.add(i)
            hit.update(outs)
    return sorted(hit)


def spike(customer, level, tighten, scores):
    # Only money going out: a salary arriving is large next to daily spending, but it is not a spike.
    m = LEVELS["spike"][level]
    return [i for i, p in enumerate(customer["p"])
            if p[1] == 1 and p[2] >= SPIKE_MIN_AMOUNT and p[2] >= m * customer["typical"]]


def mixer(customer, level, tighten, scores):
    return [i for i, p in enumerate(customer["p"]) if p[5] == 1]


RULES = {"large": large, "many": many, "country": country, "justUnder": just_under,
         "passThrough": pass_through, "spike": spike, "mixer": mixer}


def triggers(customer, key, level, tighten, scores):
    return RULES[key](customer, level, tighten, scores)


def flagged_ids(customers, settings, scores):
    """settings = {"tighten": bool, "rules": {key: {"on": bool, "level": int}}}"""
    out = []
    for c in customers:
        for key, cfg in settings["rules"].items():
            if cfg["on"] and triggers(c, key, cfg["level"], settings["tighten"], scores):
                out.append(c["id"])
                break
    return out


def default_settings():
    return {"tighten": False,
            "rules": {k: {"on": True, "level": DEFAULT_LEVEL[k]} for k in RULE_KEYS}}
