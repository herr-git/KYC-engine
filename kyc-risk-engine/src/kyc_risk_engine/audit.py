from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from .models import RiskAssessment


class AuditLog:
    """Append-only JSON Lines file. One record per assessment.

    Each record stores the factor scores, evidence, overrides, and the config
    digest, so any past decision can be reproduced and explained later.
    """

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, assessment: RiskAssessment, config_digest: str) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "config_version": assessment.config_version,
            "config_digest": config_digest,
            "customer_id": assessment.customer_id,
            "score": round(assessment.score, 1),
            "band": assessment.band.value,
            "needs_manual_review": assessment.needs_manual_review,
            "review_reasons": assessment.review_reasons,
            "overrides_applied": assessment.overrides_applied,
            "factors": [asdict(f) for f in assessment.factors],
        }
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
