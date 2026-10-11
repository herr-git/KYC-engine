from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import scoring
from .audit import AuditLog
from .config import RiskConfig, load_config
from .connectors import default_sources
from .models import Customer, FactorScore, RiskAssessment, RiskBand, SourceResult
from .narrative import NarrativeGenerator, TemplateNarrative


class RiskEngine:
    """Gathers data from sources, scores factors, applies override rules, explains the result."""

    def __init__(
        self,
        config: RiskConfig | None = None,
        sources: list | None = None,
        narrator: NarrativeGenerator | None = None,
        audit_path: Path | str | None = None,
        source_timeout_seconds: float = 5.0,
    ):
        self.config = config or load_config()
        self.sources = sources if sources is not None else default_sources(self.config)
        self.narrator = narrator or TemplateNarrative()
        self.audit = AuditLog(audit_path) if audit_path else None
        self.timeout = source_timeout_seconds

    # ---- data gathering -------------------------------------------------------------

    def _gather(self, customer: Customer) -> dict[str, SourceResult]:
        """Query all sources in parallel. One failing source never fails the assessment."""

        def call(src) -> SourceResult:
            try:
                return SourceResult(src.name, True, src.fetch(customer))
            except Exception as exc:  # any connector failure becomes "data unavailable"
                return SourceResult(src.name, False, error=f"{type(exc).__name__}: {exc}")

        with ThreadPoolExecutor(max_workers=max(1, len(self.sources))) as pool:
            futures = {pool.submit(call, s): s for s in self.sources}
            results: dict[str, SourceResult] = {}
            for fut, src in futures.items():
                try:
                    results[src.name] = fut.result(timeout=self.timeout)
                except Exception as exc:
                    results[src.name] = SourceResult(src.name, False, error=f"{type(exc).__name__}: timed out or failed")
            return results

    # ---- assessment -----------------------------------------------------------------

    def assess(self, customer: Customer) -> RiskAssessment:
        cfg = self.config
        data = self._gather(customer)

        factors: list[FactorScore] = [
            scoring.score_geography(customer, data.get("country_risk"), cfg),
            scoring.score_screening(customer, data.get("screening"), cfg),
            scoring.score_product(customer, cfg),
            scoring.score_channel(customer, cfg),
            scoring.score_identity(customer, data.get("identity"), cfg),
            scoring.score_crypto_exposure(customer, data.get("crypto_exposure"), cfg),
            scoring.score_profile(customer, cfg),
        ]
        score = sum(f.contribution for f in factors)
        band = self._band_for(score)

        floor, overrides, review_reasons = self._apply_rules(factors, data)
        if floor.severity > band.severity:
            band = floor

        assessment = RiskAssessment(
            customer_id=customer.customer_id,
            score=score,
            band=band,
            factors=factors,
            overrides_applied=overrides,
            needs_manual_review=bool(review_reasons) or band in (RiskBand.HIGH, RiskBand.BLOCKED),
            review_reasons=review_reasons,
            config_version=cfg.version,
        )
        assessment.narrative = self.narrator.generate(assessment)
        if self.audit:
            self.audit.write(assessment, cfg.digest)
        return assessment

    def assess_many(self, customers: list[Customer]) -> list[RiskAssessment]:
        """Assess all customers and rank them: most severe band first, then highest score."""
        results = [self.assess(c) for c in customers]
        return sorted(results, key=lambda a: (a.band.severity, a.score), reverse=True)

    # ---- internals ------------------------------------------------------------------

    def _band_for(self, score: float) -> RiskBand:
        b = self.config["bands"]
        if score >= b["high_from"]:
            return RiskBand.HIGH
        if score >= b["medium_from"]:
            return RiskBand.MEDIUM
        return RiskBand.LOW

    def _apply_rules(
        self, factors: list[FactorScore], data: dict[str, SourceResult]
    ) -> tuple[RiskBand, list[str], list[str]]:
        """Override rules. A weighted score alone must never hide a hard-stop condition."""
        floor = RiskBand.LOW
        overrides: list[str] = []
        review: list[str] = []

        def raise_floor(band: RiskBand, reason: str) -> None:
            nonlocal floor
            overrides.append(f"{reason} -> minimum band {band.value}")
            if band.severity > floor.severity:
                floor = band

        t = self.config["screening"]
        screen = data.get("screening")
        if screen and screen.ok:
            conf, kind = screen.signals["match_confidence"], screen.signals["list"]
            confirmed = conf >= t["confirmed_match_from"]
            potential = conf >= t["potential_match_from"]
            if kind == "sanctions" and confirmed:
                raise_floor(RiskBand.BLOCKED, "Confirmed sanctions match")
            elif kind == "sanctions" and potential:
                raise_floor(RiskBand.HIGH, "Potential sanctions match")
                review.append("Potential sanctions match needs analyst confirmation")
            if kind == "pep_foreign" and (confirmed or potential):
                raise_floor(RiskBand.HIGH, "Foreign politically exposed person match")
                review.append("Foreign PEP requires enhanced due diligence")

        geo = data.get("country_risk")
        if geo and geo.ok and geo.signals["call_for_action"]:
            raise_floor(RiskBand.HIGH, f"High-risk jurisdiction ({', '.join(geo.signals['call_for_action'])})")

        ident = data.get("identity")
        if ident and ident.ok and not ident.signals["document_authentic"]:
            raise_floor(RiskBand.HIGH, "Identity document failed authenticity check")
            review.append("Possible forged identity document")

        crypto = data.get("crypto_exposure")
        if crypto and crypto.ok and crypto.signals.get("mixer_exposure"):
            raise_floor(RiskBand.HIGH, "Direct exposure to a mixing service")

        # Compounding: several elevated factors together matter more than a weighted average shows.
        comp = self.config["compounding"]
        elevated = [f.name for f in factors if f.data_available and f.score >= comp["elevated_from"]]
        if len(elevated) >= comp["high_if_at_least"]:
            raise_floor(RiskBand.HIGH, f"{len(elevated)} elevated factors together ({', '.join(elevated)})")
        elif len(elevated) >= comp["medium_if_at_least"]:
            raise_floor(RiskBand.MEDIUM, f"{len(elevated)} elevated factors together ({', '.join(elevated)})")

        missing_required = [
            f.name for f in factors if not f.data_available and f.name in self.config["required_factors"]
        ]
        if missing_required:
            raise_floor(RiskBand.MEDIUM, f"Required data missing: {', '.join(missing_required)}")
            review.append(f"Cannot complete onboarding checks without: {', '.join(missing_required)}")

        missing_weight = sum(f.weight for f in factors if not f.data_available)
        if missing_weight > self.config["max_missing_weight_before_review"]:
            names = ", ".join(f.name for f in factors if not f.data_available)
            raise_floor(RiskBand.MEDIUM, f"Too much missing data ({missing_weight:.0%} of weight: {names})")
            review.append(f"Score is unreliable: no data for {names}")

        return floor, overrides, review
