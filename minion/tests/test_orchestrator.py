"""Orchestrator lifecycle: happy path, replay idempotency, step-failure halt, schema shape."""

from __future__ import annotations

from dataclasses import dataclass, field

from minion.config import STEP_ORDER
from minion.models import Run, RunStatus, StepName
from minion.orchestrator import run_pipeline
from minion.steps import StepContext, StepResult

DATE = "2026-06-01"


@dataclass
class BoomStep:
    """A step that always raises, to exercise the failure-halt path (AC-7)."""

    name: StepName = StepName.assemble

    def run(self, ctx: StepContext) -> StepResult:
        raise RuntimeError("boom")


@dataclass
class RecordingStep:
    """Records whether it ran, to assert steps after a failure are skipped."""

    name: StepName
    ran: list[StepName] = field(default_factory=list)

    def run(self, ctx: StepContext) -> StepResult:
        self.ran.append(self.name)
        return StepResult()


def test_happy_path_writes_nine_success_steps(run_store, lock_store, clock) -> None:
    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock)
    assert final.status is RunStatus.success
    assert final.error is None
    assert final.endedAt is not None
    assert [s.name for s in final.steps] == list(STEP_ORDER)
    assert all(s.status is RunStatus.success for s in final.steps)
    assert all(s.error is None for s in final.steps)


def test_run_has_ulid_runid_and_validates_against_schema(run_store, lock_store, clock) -> None:
    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock)
    assert len(final.runId) == 26  # ULID
    # Round-trips through the generated schema model (AC-2).
    assert Run.model_validate(final.model_dump()) == final


def test_replay_overwrites_with_fresh_runid_no_orphans(run_store, lock_store, clock) -> None:
    first = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock)
    second = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock)
    assert second.runId != first.runId
    stored = run_store.get_run(DATE)
    assert stored is not None
    assert stored.runId == second.runId
    assert len(stored.steps) == 9  # no duplicate/orphan children from the first attempt


def test_step_failure_marks_run_failure_and_halts(run_store, lock_store, clock) -> None:
    after = RecordingStep(name=StepName.generate)
    steps = (RecordingStep(name=StepName.gmail), BoomStep(), after)
    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)
    assert final.status is RunStatus.failure
    assert final.error is not None and "boom" in final.error
    statuses = {s.name: s.status for s in final.steps}
    assert statuses[StepName.gmail] is RunStatus.success
    assert statuses[StepName.assemble] is RunStatus.failure
    assert StepName.generate not in statuses  # step after the failure never ran
    assert after.ran == []
