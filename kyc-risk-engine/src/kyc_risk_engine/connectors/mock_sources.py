"""Mock data sources. All names, lists and fixtures are fictional."""

from __future__ import annotations

import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from ..config import RiskConfig
from ..models import Customer

DATA_DIR = Path(__file__).resolve().parents[3] / "data"

# Fictional watchlist used by the mock screening source.
FICTIONAL_WATCHLIST = [
    {"name": "Viktor Brennagan", "list": "sanctions", "dob": "1971-03-02"},
    {"name": "Marta Ellingsen-Okoye", "list": "pep_foreign", "dob": "1964-09-18"},
    {"name": "Jonas Halvorsen", "list": "pep_domestic", "dob": "1958-01-30"},
    {"name": "Anselm Karrow", "list": "adverse_media", "hits": 3, "dob": "1983-06-11"},
]


def normalise_name(name: str) -> str:
    """Lowercase, strip accents and punctuation, and sort tokens so word order does not matter."""
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    tokens = re.sub(r"[^a-z0-9 ]", " ", ascii_only.lower()).split()
    return " ".join(sorted(tokens))


def name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalise_name(a), normalise_name(b)).ratio()


class MockScreeningSource:
    """Sanctions, PEP and adverse media screening with fuzzy name matching."""

    name = "screening"

    def __init__(self, watchlist: list[dict[str, Any]] | None = None):
        self.watchlist = watchlist if watchlist is not None else FICTIONAL_WATCHLIST

    def fetch(self, customer: Customer) -> dict[str, Any]:
        best: dict[str, Any] | None = None
        best_conf = 0.0
        for entry in self.watchlist:
            conf = name_similarity(customer.full_name, entry["name"])
            # A matching date of birth raises confidence, a different one lowers it.
            if conf >= 0.75 and entry.get("dob"):
                conf = min(1.0, conf + 0.08) if entry["dob"] == customer.date_of_birth else max(0.0, conf - 0.10)
            if conf > best_conf:
                best, best_conf = entry, conf
        if best is None:
            return {"match_confidence": 0.0, "list": None, "adverse_media_hits": 0}
        return {
            "match_confidence": round(best_conf, 3),
            "list": best["list"],
            "matched_name": best["name"],
            "adverse_media_hits": best.get("hits", 0),
        }


class MockIdentitySource:
    """Identity document and liveness check results, read from a fixture file."""

    name = "identity"

    def __init__(self, fixtures: dict[str, Any] | None = None):
        self.fixtures = fixtures if fixtures is not None else _load_fixtures()

    def fetch(self, customer: Customer) -> dict[str, Any]:
        record = self.fixtures.get(customer.customer_id, {}).get("identity")
        if record is None:
            raise LookupError("no identity record for customer")
        if record.get("simulate_outage"):
            raise ConnectionError("identity provider timed out")
        return record


class MockCryptoExposureSource:
    """Share of a customer's wallet history linked to high-risk services."""

    name = "crypto_exposure"

    def __init__(self, fixtures: dict[str, Any] | None = None):
        self.fixtures = fixtures if fixtures is not None else _load_fixtures()

    def fetch(self, customer: Customer) -> dict[str, Any]:
        if not customer.wallet_addresses:
            return {"wallets_checked": 0, "high_risk_exposure_pct": 0.0, "mixer_exposure": False}
        record = self.fixtures.get(customer.customer_id, {}).get("crypto")
        if record is None:
            raise LookupError("no wallet analytics for customer")
        return {"wallets_checked": len(customer.wallet_addresses), **record}


class CountryRiskSource:
    """Looks up country risk scores from the config table.

    Kept as a connector so a real country risk feed can replace it later.
    """

    name = "country_risk"

    def __init__(self, config: RiskConfig):
        self.table = config["country_risk"]["scores"]
        self.default = config["country_risk"]["default"]
        self.call_for_action = set(config["country_risk"]["call_for_action"])

    def fetch(self, customer: Customer) -> dict[str, Any]:
        touchpoints = {
            "residence": customer.residence_country,
            "nationality": customer.nationality,
        }
        for i, c in enumerate(customer.counterparty_countries):
            touchpoints[f"counterparty_{i + 1}"] = c
        return {
            "scores": {role: self.table.get(code, self.default) for role, code in touchpoints.items()},
            "countries": touchpoints,
            "call_for_action": sorted(
                {code for code in touchpoints.values() if code in self.call_for_action}
            ),
        }


def _load_fixtures() -> dict[str, Any]:
    return json.loads((DATA_DIR / "mock_source_data.json").read_text(encoding="utf-8"))


def default_sources(config: RiskConfig) -> list:
    fixtures = _load_fixtures()
    return [
        CountryRiskSource(config),
        MockScreeningSource(),
        MockIdentitySource(fixtures),
        MockCryptoExposureSource(fixtures),
    ]
