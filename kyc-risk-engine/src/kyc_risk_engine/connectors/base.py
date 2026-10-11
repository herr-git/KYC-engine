from __future__ import annotations

from typing import Any, Protocol

from ..models import Customer


class DataSource(Protocol):
    """Contract every data source connector implements.

    A real connector would call an identity verification vendor, a sanctions and
    politically exposed person (PEP) screening provider, or a blockchain analytics
    provider. The engine only depends on this small interface, so swapping a mock
    for a real vendor means writing one class and changing nothing else.
    """

    name: str

    def fetch(self, customer: Customer) -> dict[str, Any]:
        """Return a dict of signals. Raise on failure; the engine handles it."""
        ...
