"""Tests for the Clock port and ULID helper."""

from __future__ import annotations

from datetime import datetime, timedelta

from minion.clock import Clock, FrozenClock, SystemClock, new_run_id
from minion.config import PARIS_TZ


def test_system_clock_is_paris_aware() -> None:
    clock: Clock = SystemClock()
    now = clock.now()
    assert now.tzinfo is not None


def test_frozen_clock_returns_injected_instant() -> None:
    instant = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)
    clock = FrozenClock(instant)
    assert clock.now() == instant


def test_frozen_clock_naive_instant_gets_paris_tz() -> None:
    clock = FrozenClock(datetime(2026, 6, 1, 6, 0))
    assert clock.now().tzinfo is not None


def test_frozen_clock_advances() -> None:
    clock = FrozenClock(datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ))
    clock.advance(timedelta(minutes=21))
    assert clock.now() == datetime(2026, 6, 1, 6, 21, tzinfo=PARIS_TZ)


def test_new_run_id_is_unique_sortable_ulid() -> None:
    ids = [new_run_id() for _ in range(5)]
    assert all(len(i) == 26 for i in ids)
    assert len(set(ids)) == 5
    # ULIDs minted in order sort by creation time.
    assert ids == sorted(ids)
