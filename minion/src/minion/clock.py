"""Time and identity injection.

The orchestrator never reads the wall clock or mints ids directly — it takes a `Clock`
and calls `new_run_id()`. `SystemClock` is the production implementation; `FrozenClock`
makes idempotency, ordering, and stale-lock tests deterministic (AD-6).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Protocol, runtime_checkable

from ulid import ULID

from minion.config import PARIS_TZ


@runtime_checkable
class Clock(Protocol):
    """Source of the current instant, timezone-aware in Europe/Paris."""

    def now(self) -> datetime: ...


class SystemClock:
    """Production clock — the real wall clock in Europe/Paris."""

    def now(self) -> datetime:
        return datetime.now(PARIS_TZ)


class FrozenClock:
    """Test clock fixed at a given instant, advanceable to exercise time-dependent logic."""

    def __init__(self, instant: datetime) -> None:
        if instant.tzinfo is None:
            instant = instant.replace(tzinfo=PARIS_TZ)
        self._instant = instant

    def now(self) -> datetime:
        return self._instant

    def advance(self, delta: timedelta) -> None:
        self._instant = self._instant + delta


def new_run_id() -> str:
    """Mint a fresh ULID string for a run attempt (sortable, 26 chars, AD-1)."""
    return str(ULID())
