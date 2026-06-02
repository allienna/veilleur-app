"""Orchestrator `success_with_warnings` propagation + precedence (T-3.1, plan AD-4)."""

from __future__ import annotations

from dataclasses import dataclass

from minion.models import RunStatus, StepName
from minion.orchestrator import run_pipeline
from minion.steps import StepContext, StepResult

DATE = "2026-06-01"


@dataclass
class WarnStep:
    """Succeeds but raises a run-level warning (the Imagen placeholder fallback shape)."""

    name: StepName = StepName.imagen
    reason: str = "imagen_moderation_fallback"

    def run(self, ctx: StepContext) -> StepResult:
        return StepResult(warning=self.reason)


@dataclass
class OkStep:
    name: StepName = StepName.github

    def run(self, ctx: StepContext) -> StepResult:
        return StepResult()


@dataclass
class BoomStep:
    name: StepName = StepName.github

    def run(self, ctx: StepContext) -> StepResult:
        raise RuntimeError("boom")


@dataclass
class SkipStep:
    name: StepName = StepName.github
    status: RunStatus = RunStatus.skipped
    reason: str = "no_sources"

    def run(self, ctx: StepContext) -> StepResult:
        return StepResult(terminal_status=self.status, reason=self.reason)


def test_warning_downgrades_clean_success(run_store, lock_store, clock) -> None:
    steps = (WarnStep(), OkStep())
    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)
    assert final.status is RunStatus.success_with_warnings
    assert final.error == "imagen_moderation_fallback"
    # The warning is run-level: the producing step's own record stays success.
    statuses = {s.name: s.status for s in final.steps}
    assert statuses[StepName.imagen] is RunStatus.success


def test_no_warning_stays_success(run_store, lock_store, clock) -> None:
    steps = (OkStep(),)
    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)
    assert final.status is RunStatus.success
    assert final.error is None


def test_failure_overrides_warning(run_store, lock_store, clock) -> None:
    steps = (WarnStep(), BoomStep())
    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)
    assert final.status is RunStatus.failure
    assert final.error is not None and "boom" in final.error


def test_terminal_status_overrides_warning(run_store, lock_store, clock) -> None:
    steps = (WarnStep(), SkipStep())
    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)
    assert final.status is RunStatus.skipped
    assert final.error == "no_sources"


def test_first_warning_is_latched(run_store, lock_store, clock) -> None:
    steps = (WarnStep(reason="first"), WarnStep(name=StepName.publish, reason="second"))
    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)
    assert final.status is RunStatus.success_with_warnings
    assert final.error == "first"
