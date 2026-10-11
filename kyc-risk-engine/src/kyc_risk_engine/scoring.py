"""Pure scoring functions: turn source signals into scored factors.

Nothing in this file does any input or output. That keeps every rule easy to unit test
and easy to read in an audit.
"""

from __future__ import annotations

from .config import RiskConfig
from .models import Customer, FactorScore, SourceResult


def _missing(name: str, weight: float, config: RiskConfig, why: str) -> FactorScore:
    return FactorScore(
        name=name,
        score=float(config["missing_data_score"]),
        weight=weight,
        data_available=False,
        evidence=[f"Data unavailable ({why}); neutral-high default score applied"],
    )


def score_geography(customer: Customer, src: SourceResult | None, config: RiskConfig) -> FactorScore:
    w = config.weights["geography"]
    if src is None or not src.ok:
        return _missing("geography", w, config, src.error if src else "source not run")
    scores: dict[str, float] = src.signals["scores"]
    countries: dict[str, str] = src.signals["countries"]
    # Highest-risk touchpoint wins. Averaging would let a clean residence hide a risky counterparty.
    role, top = max(scores.items(), key=lambda kv: kv[1])
    evidence = [f"Highest-risk touchpoint: {role} ({countries[role]}) scores {top}"]
    if src.signals["call_for_action"]:
        evidence.append(f"Touches high-risk jurisdiction(s): {', '.join(src.signals['call_for_action'])}")
    return FactorScore("geography", float(top), w, True, evidence)


def score_screening(customer: Customer, src: SourceResult | None, config: RiskConfig) -> FactorScore:
    w = config.weights["screening"]
    if src is None or not src.ok:
        return _missing("screening", w, config, src.error if src else "source not run")
    s = src.signals
    conf = s["match_confidence"]
    thresholds = config["screening"]
    confirmed = conf >= thresholds["confirmed_match_from"]
    potential = conf >= thresholds["potential_match_from"]
    evidence: list[str] = []
    score = 0.0

    if s["list"] and (confirmed or potential):
        kind = "confirmed" if confirmed else "potential"
        evidence.append(f"{kind.capitalize()} match on {s['list']} list (confidence {conf})")
        if s["list"] == "sanctions":
            score = 100.0 if confirmed else 75.0
        elif s["list"] == "pep_foreign":
            score = 80.0 if confirmed else 60.0
        elif s["list"] == "pep_domestic":
            score = 55.0 if confirmed else 40.0
        elif s["list"] == "adverse_media":
            score = 45.0 if confirmed else 30.0
    if s["adverse_media_hits"] and (confirmed or potential):
        media = min(45.0, 15.0 * s["adverse_media_hits"])
        evidence.append(f"{s['adverse_media_hits']} adverse media hit(s)")
        score = max(score, media)
    if not evidence:
        evidence.append("No sanctions, PEP or adverse media match above threshold")
    return FactorScore("screening", score, w, True, evidence)


def score_product(customer: Customer, config: RiskConfig) -> FactorScore:
    table = config["product_risk"]
    score = table.get(customer.product)
    known = score is not None
    score = float(score if score is not None else config["missing_data_score"])
    ev = [f"Product '{customer.product}' scores {score:g}"] if known else [f"Unknown product '{customer.product}'; default applied"]
    return FactorScore("product", score, config.weights["product"], known, ev)


def score_channel(customer: Customer, config: RiskConfig) -> FactorScore:
    table = config["channel_risk"]
    score = table.get(customer.onboarding_channel)
    known = score is not None
    score = float(score if score is not None else config["missing_data_score"])
    ev = [f"Onboarding channel '{customer.onboarding_channel}' scores {score:g}"] if known else [f"Unknown channel '{customer.onboarding_channel}'; default applied"]
    return FactorScore("channel", score, config.weights["channel"], known, ev)


def score_identity(customer: Customer, src: SourceResult | None, config: RiskConfig) -> FactorScore:
    w = config.weights["identity"]
    if src is None or not src.ok:
        return _missing("identity", w, config, src.error if src else "source not run")
    s = src.signals
    if not s["document_authentic"]:
        return FactorScore("identity", 100.0, w, True, ["Identity document failed authenticity check"])
    ev: list[str] = []
    score = round((1.0 - s["face_match"]) * 100, 1)
    ev.append(f"Face match {s['face_match']:.2f}")
    liveness = s.get("liveness_passed")
    if liveness is False:
        score = max(score, 80.0)
        ev.append("Liveness check failed")
    elif liveness is None:
        score = max(score, 40.0)
        ev.append("No liveness check performed")
    if s["face_match"] < 0.80:
        score = max(score, 70.0)
        ev.append("Face match below 0.80")
    return FactorScore("identity", float(score), w, True, ev)


def score_crypto_exposure(customer: Customer, src: SourceResult | None, config: RiskConfig) -> FactorScore:
    w = config.weights["crypto_exposure"]
    if src is None or not src.ok:
        return _missing("crypto_exposure", w, config, src.error if src else "source not run")
    s = src.signals
    if s["wallets_checked"] == 0:
        return FactorScore("crypto_exposure", 0.0, w, True, ["No wallets supplied"])
    pct = s["high_risk_exposure_pct"]
    score = min(100.0, pct * 2.0)
    ev = [f"{pct:g}% of wallet history linked to high-risk services"]
    if s["mixer_exposure"]:
        score = max(score, 85.0)
        ev.append("Direct exposure to a mixing service")
    return FactorScore("crypto_exposure", score, w, True, ev)


def score_profile(customer: Customer, config: RiskConfig) -> FactorScore:
    w = config.weights["customer_profile"]
    table = config["occupation_risk"]
    base = table.get(customer.occupation, table["unknown"])
    ev = [f"Occupation '{customer.occupation}' scores {base}"]
    p = config["profile"]
    if (
        not customer.source_of_funds_documented
        and customer.expected_monthly_volume_eur > p["penalty_applies_above_monthly_volume_eur"]
    ):
        base = min(100, base + p["undocumented_source_of_funds_penalty"])
        ev.append(
            f"Source of funds undocumented with expected volume above "
            f"{p['penalty_applies_above_monthly_volume_eur']:,} EUR per month"
        )
    return FactorScore("customer_profile", float(base), w, True, ev)
