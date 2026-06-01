"""Concurrency guard: abort-when-locked, lock released on success/failure, stale reclaim."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from minion.config import PARIS_TZ
from minion.models import ALREADY_RUNNING, Lock, RunStatus, StepName
from minion.orchestrator import run_pipeline
from minion.steps import StepContext, StepResult

DATE = "2026-06-01"
T0 = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)


@dataclass
class BoomStep:
    name: StepName = StepName.gmail

    def run(self, ctx: StepContext) -> StepResult:
        raise RuntimeError("boom")


def test_abort_when_locked_runs_no_steps(run_store, lock_store, clock) -> None:
    # A live lock is already held by another run.
    lock_store.acquire(Lock(run_id="OTHER", date=DATE, started_at=T0))
    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock)
    assert final.status is RunStatus.aborted
    assert final.error == ALREADY_RUNNING
    assert final.steps == []
    # The aborted invocation never touched runs/{date}.
    assert run_store.get_run(DATE) is None


def test_lock_released_after_success(run_store, lock_store, clock) -> None:
    run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock)
    # Lock is free again — a fresh acquire succeeds.
    assert lock_store.acquire(Lock(run_id="NEXT", date=DATE, started_at=clock.now())) is True


def test_lock_released_after_failure(run_store, lock_store, clock) -> None:
    run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=(BoomStep(),))
    assert lock_store.acquire(Lock(run_id="NEXT", date=DATE, started_at=clock.now())) is True


def test_stale_lock_is_reclaimed(run_store, lock_store, clock) -> None:
    # A dead run left a lock older than the 20-min cap.
    lock_store.acquire(Lock(run_id="DEAD", date=DATE, started_at=T0))
    clock.advance(timedelta(minutes=21))
    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock)
    assert final.status is RunStatus.success  # reclaimed and ran normally
