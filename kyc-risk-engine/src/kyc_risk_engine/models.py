from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class RiskBand(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    BLOCKED = "blocked"

    @property
    def severity(self) -> int:
        return {"low": 0, "medium": 1, "high": 2, "blocked": 3}[self.value]


@dataclass(frozen=True)
class Customer:
    customer_id: str
    full_name: str
    date_of_birth: str
    nationality: str
    residence_country: str
    occupation: str
    onboarding_channel: str
    product: str
    expected_monthly_volume_eur: float
    source_of_funds_documented: bool = False
    counterparty_countries: tuple[str, ...] = ()
    wallet_addresses: tuple[str, ...] = ()

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Customer":
        d = dict(d)
        d["counterparty_countries"] = tuple(d.get("counterparty_countries", ()))
        d["wallet_addresses"] = tuple(d.get("wallet_addresses", ()))
        return cls(**d)


@dataclass
class SourceResult:
    """What one external data source returned (or why it failed)."""

    source: str
    ok: bool
    signals: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


@dataclass
class FactorScore:
    """One scored risk factor. Score is 0 (no risk) to 100 (maximum risk)."""

    name: str
    score: float
    weight: float
    data_available: bool
    evidence: list[str] = field(default_factory=list)

    @property
    def contribution(self) -> float:
        return self.score * self.weight


@dataclass
class RiskAssessment:
    customer_id: str
    score: float
    band: RiskBand
    factors: list[FactorScore]
    overrides_applied: list[str]
    needs_manual_review: bool
    review_reasons: list[str]
    config_version: str
    narrative: str = ""

    def top_factors(self, n: int = 3) -> list[FactorScore]:
        return sorted(self.factors, key=lambda f: f.contribution, reverse=True)[:n]
