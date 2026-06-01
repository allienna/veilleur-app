"""Tests for the in-memory store fakes — overwrite-by-date and lock compare-and-set."""

from __future__ import annotations

from datetime import datetime, timedelta

from minion.clock import FrozenClock
from minion.config import PARIS_TZ
from minion.models import Lock, Run, RunStatus, RunStep, StepName
from minion.store.memory import InMemoryLockStore, InMemoryRunStore

_T0 = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)


def _running_run(date: str = "2026-06-01", run_id: str = "RUN1") -> Run:
    return Run(runId=run_id, date=date, status=RunStatus.running, startedAt=_T0, steps=[])


def test_start_run_then_get_run_roundtrips() -> None:
    store = InMemoryRunStore()
    store.start_run(_running_run())
    store.upsert_step(
        "2026-06-01",
        RunStep(name=StepName.gmail, status=RunStatus.success, startedAt=_T0, endedAt=_T0),
    )
    got = store.get_run("2026-06-01")
    assert got is not None
    assert got.runId == "RUN1"
    assert [s.name for s in got.steps] == [StepName.gmail]


def test_steps_assembled_in_canonical_order() -> None:
    store = InMemoryRunStore()
    store.start_run(_running_run())
    for name in (StepName.jina, StepName.gmail):  # inserted out of order
        store.upsert_step("2026-06-01", RunStep(name=name, status=RunStatus.success, startedAt=_T0))
    got = store.get_run("2026-06-01")
    assert got is not None
    assert [s.name for s in got.steps] == [StepName.gmail, StepName.jina]


def test_start_run_clears_prior_step_children() -> None:
    store = InMemoryRunStore()
    store.start_run(_running_run())
    store.upsert_step(
        "2026-06-01", RunStep(name=StepName.gmail, status=RunStatus.success, startedAt=_T0)
    )
    store.start_run(_running_run(run_id="RUN2"))  # replay
    got = store.get_run("2026-06-01")
    assert got is not None
    assert got.runId == "RUN2"
    assert got.steps == []  # no orphan from the prior attempt


def test_get_run_missing_returns_none() -> None:
    assert InMemoryRunStore().get_run("2026-06-01") is None


def test_lock_blocks_second_live_acquire() -> None:
    store = InMemoryLockStore(FrozenClock(_T0))
    assert store.acquire(Lock(run_id="RUN1", date="2026-06-01", started_at=_T0)) is True
    assert store.acquire(Lock(run_id="RUN2", date="2026-06-01", started_at=_T0)) is False


def test_stale_lock_is_reclaimed() -> None:
    clock = FrozenClock(_T0)
    store = InMemoryLockStore(clock)
    store.acquire(Lock(run_id="DEAD", date="2026-06-01", started_at=_T0))
    clock.advance(timedelta(minutes=21))  # exceed the 20-min cap
    assert store.acquire(Lock(run_id="RUN2", date="2026-06-01", started_at=clock.now())) is True


def test_release_frees_only_own_lock() -> None:
    store = InMemoryLockStore(FrozenClock(_T0))
    store.acquire(Lock(run_id="RUN1", date="2026-06-01", started_at=_T0))
    store.release("OTHER")  # not the holder — no-op
    assert store.acquire(Lock(run_id="RUN2", date="2026-06-01", started_at=_T0)) is False
    store.release("RUN1")  # holder releases
    assert store.acquire(Lock(run_id="RUN2", date="2026-06-01", started_at=_T0)) is True
