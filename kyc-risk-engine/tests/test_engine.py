import json
from pathlib import Path

import pytest

from kyc_risk_engine import Customer, RiskBand, RiskEngine
from kyc_risk_engine.config import load_config
from kyc_risk_engine.connectors.mock_sources import normalise_name, name_similarity

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def customers():
    raw = json.loads((ROOT / "data" / "synthetic_customers.json").read_text(encoding="utf-8"))
    return {d["customer_id"]: Customer.from_dict(d) for d in raw}


@pytest.fixture(scope="module")
def engine():
    return RiskEngine()


def test_clean_customer_is_low_and_needs_no_review(engine, customers):
    a = engine.assess(customers["C001"])
    assert a.band is RiskBand.LOW
    assert not a.needs_manual_review
    assert a.score < 15


def test_confirmed_sanctions_match_is_blocked_whatever_the_score(engine, customers):
    a = engine.assess(customers["C005"])
    assert a.band is RiskBand.BLOCKED
    assert any("sanctions" in o.lower() for o in a.overrides_applied)


def test_foreign_pep_is_floored_to_high_even_with_modest_score(engine, customers):
    a = engine.assess(customers["C004"])
    assert a.score < 65  # the weighted score alone would not reach HIGH
    assert a.band is RiskBand.HIGH
    assert a.needs_manual_review


def test_near_miss_name_with_different_birth_date_is_potential_match_for_review(engine, customers):
    a = engine.assess(customers["C008"])
    screening = next(f for f in a.factors if f.name == "screening")
    assert any("Potential" in e for e in screening.evidence)
    assert a.band is RiskBand.HIGH
    assert a.needs_manual_review


def test_stacked_moderate_risks_escalate_to_high(engine, customers):
    a = engine.assess(customers["C006"])
    assert a.score < 65
    assert a.band is RiskBand.HIGH
    assert any("elevated factors" in o for o in a.overrides_applied)


def test_two_elevated_factors_escalate_to_medium(engine, customers):
    a = engine.assess(customers["C003"])
    assert a.band is RiskBand.MEDIUM


def test_source_outage_degrades_gracefully_and_forces_review(engine, customers):
    a = engine.assess(customers["C007"])
    identity = next(f for f in a.factors if f.name == "identity")
    assert not identity.data_available
    assert a.band.severity >= RiskBand.MEDIUM.severity
    assert a.needs_manual_review
    assert any("identity" in r for r in a.review_reasons)


def test_ranking_orders_by_band_then_score(engine, customers):
    ranked = engine.assess_many(list(customers.values()))
    keys = [(a.band.severity, a.score) for a in ranked]
    assert keys == sorted(keys, reverse=True)
    assert ranked[0].customer_id == "C005"
    assert ranked[-1].customer_id == "C001"


def test_audit_log_records_config_digest_and_factors(customers, tmp_path):
    path = tmp_path / "audit.jsonl"
    eng = RiskEngine(audit_path=path)
    eng.assess(customers["C002"])
    record = json.loads(path.read_text().strip())
    assert record["config_digest"] == load_config().digest
    assert {f["name"] for f in record["factors"]} >= {"geography", "screening", "identity"}


def test_narrative_only_restates_the_decision(engine, customers):
    a = engine.assess(customers["C004"])
    assert a.band.value in a.narrative
    assert f"{a.score:.0f}/100" in a.narrative


def test_config_rejects_weights_that_do_not_sum_to_one(tmp_path):
    raw = json.loads((ROOT / "config" / "risk_config.json").read_text())
    raw["weights"]["geography"] = 0.5
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(raw))
    with pytest.raises(ValueError, match="sum to 1.0"):
        load_config(bad)


def test_name_matching_ignores_order_accents_and_punctuation():
    assert normalise_name("Ellingsen-Okoye, Márta") == normalise_name("marta ellingsen okoye")
    assert name_similarity("Okoye Marta Ellingsen", "Marta Ellingsen-Okoye") > 0.95
