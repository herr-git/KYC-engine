"""Run the engine on the synthetic customers and print a ranked queue."""

from __future__ import annotations

import json
from pathlib import Path

from .engine import RiskEngine
from .models import Customer

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    customers = [
        Customer.from_dict(d)
        for d in json.loads((ROOT / "data" / "synthetic_customers.json").read_text(encoding="utf-8"))
    ]
    audit_path = ROOT / "out" / "audit.jsonl"
    audit_path.unlink(missing_ok=True)
    engine = RiskEngine(audit_path=audit_path)
    ranked = engine.assess_many(customers)

    print(f"{'Rank':<5}{'Customer':<10}{'Score':>6}  {'Band':<8}Review")
    print("-" * 44)
    for i, a in enumerate(ranked, 1):
        print(f"{i:<5}{a.customer_id:<10}{a.score:>6.0f}  {a.band.value:<8}{'yes' if a.needs_manual_review else 'no'}")

    print("\nExplanation for the top-ranked customer:\n")
    print(ranked[0].narrative)
    print(f"\nAudit records written to {audit_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
