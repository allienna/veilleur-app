"""The run state machine.

`run_pipeline` mints a per-attempt ULID, takes the global lock (aborting if another run
holds it), writes the `running` run document, drives the nine steps writing per-step
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

from minion.clock import Clock, new_run_id
from minion.logging import bind
from minion.models import ALREADY_RUNNING, Lock, Run, RunStatus, RunStep
from minion.steps import STEPS, Step, StepContext
from minion.store.ports import LockStore, RunStore


def run_pipeline(
    date: str,
    *,
    run_store: RunStore,
    lock_store: LockStore,
    clock: Clock,
    steps: tuple[Step, ...] = STEPS,
) -> Run:
    """Execute the pipeline for `date`. Returns the final (assembled) run, or an in-memory
    aborted run if the concurrency guard tripped."""
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
                step_log.error("step failed")
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

        run_store.finalize_run(date, status, clock.now(), run_error)
        log.info("run finished", extra={"status": status.value})

        final = run_store.get_run(date)
        assert final is not None
        return final
    finally:
        lock_store.release(run_id)
