from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "risk_config.json"

REQUIRED_FACTORS = {
    "geography",
    "screening",
    "product",
    "channel",
    "identity",
    "crypto_exposure",
    "customer_profile",
}


@dataclass(frozen=True)
class RiskConfig:
    raw: dict[str, Any]
    digest: str

    @property
    def version(self) -> str:
        return self.raw["version"]

    @property
    def weights(self) -> dict[str, float]:
        return self.raw["weights"]

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]


def load_config(path: Path | str | None = None) -> RiskConfig:
    p = Path(path) if path else DEFAULT_CONFIG_PATH
    text = p.read_text(encoding="utf-8")
    raw = json.loads(text)
    _validate(raw)
    # The digest goes into every audit record, so a score can be tied to the exact rules used.
    return RiskConfig(raw=raw, digest=hashlib.sha256(text.encode()).hexdigest()[:12])


def _validate(raw: dict[str, Any]) -> None:
    weights = raw["weights"]
    missing = REQUIRED_FACTORS - set(weights)
    if missing:
        raise ValueError(f"Config is missing weights for: {sorted(missing)}")
    total = sum(weights.values())
    if abs(total - 1.0) > 1e-9:
        raise ValueError(f"Weights must sum to 1.0, got {total}")
    bands = raw["bands"]
    if not 0 < bands["medium_from"] < bands["high_from"] <= 100:
        raise ValueError("Band thresholds must satisfy 0 < medium_from < high_from <= 100")
