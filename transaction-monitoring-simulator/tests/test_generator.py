"""Tests for the synthetic payment generator and the reference rules. Run: python -m pytest -q"""
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import build_data as bd  # noqa: E402
import reference_rules as ref  # noqa: E402

PAYLOAD, SCORES = bd.build()
CUSTOMERS = PAYLOAD["customers"]


def test_population_and_planted_problems():
    assert len(CUSTOMERS) == 400
    assert sum(c["real"] for c in CUSTOMERS) == 32
    counts = Counter(c["pattern"] for c in CUSTOMERS)
    for key, (count, _, _) in bd.PATTERNS.items():
        assert counts[key] == count


def test_generation_is_repeatable():
    again, _ = bd.build()
    assert again == PAYLOAD


def test_payments_are_well_formed():
    for c in CUSTOMERS:
        minutes = [p[0] for p in c["p"]]
        assert minutes == sorted(minutes)
        assert c["p"], c["id"]
        for minute, direction, amount, cc, asset, mixer in c["p"]:
            assert 0 <= minute < bd.DAYS * bd.DAY
            assert direction in (0, 1) and mixer in (0, 1)
            assert amount >= 1 and isinstance(amount, int)
            assert cc in SCORES and 0 <= asset < len(bd.ASSETS)
            if mixer:
                assert asset > 0  # mixing services only exist for crypto


def test_country_scores_come_from_the_kyc_engine_config():
    assert SCORES["NG"] == 60 and SCORES["DK"] == 10 and SCORES["IR"] == 100
    assert PAYLOAD["countries"]["RU"]["score"] == 85


def test_every_planted_problem_has_a_story_and_no_innocent_pattern_is_real():
    for c in CUSTOMERS:
        assert c["story"]
        assert c["real"] == bd.PATTERNS[c["pattern"]][1]


def test_reference_rules_catch_the_planted_patterns_at_default_settings():
    flagged = set(ref.flagged_ids(CUSTOMERS, ref.default_settings(), SCORES))
    by_pattern = {}
    for c in CUSTOMERS:
        by_pattern.setdefault(c["pattern"], []).append(c["id"] in flagged)
    for pattern in ("structuring", "passThrough", "corridor", "mixing", "dormantSpike", "rapidFire"):
        assert sum(by_pattern[pattern]) >= len(by_pattern[pattern]) - 2, pattern
    assert not any(by_pattern["stealth"])


def test_innocent_behaviour_does_trigger_alerts():
    # If no innocent customer tripped a rule there would be no trade-off to show.
    flagged = set(ref.flagged_ids(CUSTOMERS, ref.default_settings(), SCORES))
    false_alarms = [c for c in CUSTOMERS if not c["real"] and c["id"] in flagged]
    assert len(false_alarms) > 50


def test_generated_files_are_current():
    for name in ("data.js", "tests/expected.json"):
        assert (ROOT / name).exists(), name
    import subprocess
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "build_data.py"), "--check"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
