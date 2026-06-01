"""Shared fixtures: a frozen clock and in-memory stores wired for the orchestrator."""

from __future__ import annotations

from datetime import datetime

import pytest

from minion.clock import FrozenClock
from minion.config import PARIS_TZ
from minion.store.memory import InMemoryLockStore, InMemoryRunStore

T0 = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)


@pytest.fixture
def clock() -> FrozenClock:
    return FrozenClock(T0)


@pytest.fixture
def run_store() -> InMemoryRunStore:
    return InMemoryRunStore()


@pytest.fixture
def lock_store(clock: FrozenClock) -> InMemoryLockStore:
    return InMemoryLockStore(clock)
