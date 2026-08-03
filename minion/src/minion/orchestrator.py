"""The run state machine.

`run_pipeline` mints a per-attempt ULID, takes the global lock (aborting if another run
holds it), writes the `running` run document, drives the ten steps writing per-step
observable children, finalizes the run, and releases the lock — on success or failure.

Invariants enforced here (constitution §2.7-§2.9):
- Idempotent replay: `start_run` overwrites `runs/{date}` and clears its step children, so a
  re-run for the same date leaves no duplicates or orphans.
- Concurrency guard: a second invocation while a run is live aborts `already_running` and
  executes no steps — and, crucially, does NOT touch `runs/{date}` (it belongs to the live
  run).
- Observable steps: every step writes `running` → terminal with timestamps; a raising step is
  recorded `failure` and halts the remaining steps.
"""

from __future__ import annotations

from typing import cast

from minion.clock import Clock, new_run_id
from minion.logging import bind
from minion.models import ALREADY_RUNNING, Lock, Run, RunStatus, RunStep
from minion.notify import Notifier
from minion.steps import STEPS, Step, StepContext
from minion.store.ports import LockStore, RunStore


def run_pipeline(
    date: str,
    *,
    run_store: RunStore,
    lock_store: LockStore,
    clock: Clock,
    steps: tuple[Step, ...] = STEPS,
    notifier: Notifier | None = None,
) -> Run:
    """Execute the pipeline for `date`. Returns the final (assembled) run, or an in-memory
    aborted run if the concurrency guard tripped.

    When a `notifier` is supplied it is invoked once, after the run is finalized, for every
    terminal path (success / success_with_warnings / failure / skipped) — the orchestrator is the
    only place that sees the final status + reason, since a graceful skip or a failure halts the
    remaining steps and never reaches the success-only `publish` step (F-012 AD-1). The notifier
    decides whether a given status warrants a push and must never raise (FR-5 soft-fail)."""
    run_id = new_run_id()
    log = bind(run_id)
    started_at = clock.now()

    lock = Lock(run_id=run_id, date=date, started_at=started_at)
    if not lock_store.acquire(lock):
        log.warning("run aborted: already_running")
        # Do not persist — `runs/{date}` belongs to the live run that holds the lock.
        return Run(
            runId=run_id,
            date=date,
            status=RunStatus.aborted,
            startedAt=started_at,
            endedAt=clock.now(),
            error=ALREADY_RUNNING,
            steps=[],
        )

    try:
        run_store.start_run(
            Run(runId=run_id, date=date, status=RunStatus.running, startedAt=started_at, steps=[])
        )
        log.info("run started")

        data: dict[str, object] = {}
        status = RunStatus.success
        run_error: str | None = None
        warning_reason: str | None = None  # first run-level warning, latched (F-006 plan AD-4)

        for step in steps:
            step_log = bind(run_id, step=step.name.value)
            step_started = clock.now()
            run_store.upsert_step(
                date, RunStep(name=step.name, status=RunStatus.running, startedAt=step_started)
            )
            try:
                result = step.run(StepContext(run_id, date, clock, step_log, data))
            except Exception as exc:
                run_store.upsert_step(
                    date,
                    RunStep(
                        name=step.name,
                        status=RunStatus.failure,
                        startedAt=step_started,
                        endedAt=clock.now(),
                        error=str(exc),
                    ),
                )
                step_log.exception("step failed")  # emit the traceback for Cloud Logging
                status = RunStatus.failure
                run_error = f"{step.name.value}: {exc}"
                break

            data.update(result.payload)
            run_store.upsert_step(
                date,
                RunStep(
                    name=step.name,
                    status=RunStatus.success,
                    startedAt=step_started,
                    endedAt=clock.now(),
                ),
            )

            if result.warning is not None and warning_reason is None:
                # Latch the first warning (plan AD-4): the step succeeded and the pipeline
                # continues, but the final run status downgrades to success_with_warnings unless
                # a later failure/terminal status overrides it. Per-step record stays success.
                warning_reason = result.warning
                step_log.warning("run warning latched", extra={"warning": warning_reason})

            if result.terminal_status is not None:
                # Graceful early-exit (AD-3): the step succeeded but ends the run with a
                # non-failure terminal status (e.g. skipped/no_sources). Halt remaining steps.
                status = result.terminal_status
                run_error = result.reason
                step_log.info(
                    "run terminated early",
                    extra={"status": status.value, "reason": result.reason},
                )
                break

        if status is RunStatus.success and warning_reason is not None:
            # Downgrade only a clean success (a failure/terminal status takes precedence, AD-4).
            status = RunStatus.success_with_warnings
            run_error = warning_reason
        # LLM cost/tokens surfaced by the generate step (F-011 AD-5); absent (None) when the run
        # never reached `generate` — e.g. skipped/no_sources or an early-step failure.
        cost_usd = cast("float | None", data.get("costUsd"))
        tokens = cast("int | None", data.get("tokens"))
        run_store.finalize_run(date, status, clock.now(), run_error, cost_usd, tokens)
        log.info("run finished", extra={"status": status.value})

        final = run_store.get_run(date)
        assert final is not None
        if notifier is not None:
            # Run-completion push (F-012). Sees the terminal status + reason for every path; the
            # notifier decides whether to send. It is contracted not to raise, but the run is
            # already finalized here — a notifier defect must never undo a finished run, so guard
            # defensively (push failure ≠ run failure, PRD §285).
            try:
                notifier.notify(final)
            except Exception:
                log.exception("notifier raised after finalize; run unaffected")
        return final
    finally:
        lock_store.release(run_id)
