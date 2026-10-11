"""Turns a finished assessment into plain-language text for an analyst.

Design rule: the narrative layer only EXPLAINS a decision that was already made by
the rules. It never changes a score or a band. That keeps the decision deterministic
and auditable, while still letting an AI model write a readable summary.
"""

from __future__ import annotations

import os
from typing import Protocol

from .models import RiskAssessment


class NarrativeGenerator(Protocol):
    def generate(self, assessment: RiskAssessment) -> str: ...


def _facts(a: RiskAssessment) -> str:
    lines = [f"Customer {a.customer_id}: score {a.score:.0f}/100, band {a.band.value}."]
    for f in a.top_factors(3):
        lines.append(f"- {f.name} (weight {f.weight:.0%}, score {f.score:.0f}): " + "; ".join(f.evidence))
    for o in a.overrides_applied:
        lines.append(f"- Override: {o}")
    for r in a.review_reasons:
        lines.append(f"- Manual review: {r}")
    return "\n".join(lines)


class TemplateNarrative:
    """Default. No network, no model, fully deterministic."""

    def generate(self, assessment: RiskAssessment) -> str:
        return _facts(assessment)


class ClaudeNarrative:
    """Optional AI narrative using the Anthropic API.

    Needs `pip install kyc-risk-engine[narrative]`, an ANTHROPIC_API_KEY, and the
    model name in KYC_NARRATIVE_MODEL. It receives only the structured facts above.
    This class is not exercised by the automated tests because it needs a live key.
    """

    SYSTEM = (
        "You write short case notes for financial crime analysts. Use only the facts "
        "provided. Do not add facts, do not change the score or band, and do not give "
        "a recommendation beyond what the facts state. Plain language, under 120 words."
    )

    def __init__(self, model: str | None = None):
        self.model = model or os.environ.get("KYC_NARRATIVE_MODEL")
        if not self.model:
            raise ValueError("Set KYC_NARRATIVE_MODEL or pass model=")
        import anthropic  # imported lazily so the core package has no dependencies

        self.client = anthropic.Anthropic()

    def generate(self, assessment: RiskAssessment) -> str:
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=400,
            system=self.SYSTEM,
            messages=[{"role": "user", "content": _facts(assessment)}],
        )
        return "".join(b.text for b in msg.content if b.type == "text")
