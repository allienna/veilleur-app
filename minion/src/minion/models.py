"""Pydantic boundary models for the orchestrator.

Re-exports the generated cross-boundary types (`Run`, `RunStep`, `RunStatus`, `StepName`,
source of truth: shared/schema/*.json) so the rest of the package imports them from one
place, and adds the Minion-internal models that are not part of the PWA-facing contract
(the concurrency `Lock`).

Identity note (AD-1): the Firestore run document is keyed by `date` (the idempotency key).
`runId` is a per-attempt ULID stored as a field — a replay of the same date overwrites the
same document but carries a fresh `runId`.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict
from veilleur_shared.run import Run, RunStatus, RunStep, StepName

__all__ = [
    "ALREADY_RUNNING",
    "Lock",
    "Run",
    "RunStatus",
    "RunStep",
    "StepName",
]

# Run-level abort reason written to `Run.error` when the concurrency guard trips (§2.8).
ALREADY_RUNNING = "already_running"


class Lock(BaseModel):
    """The single global concurrency lock document (`locks/minion`).

    A lock is *stale* (and reclaimable) when `startedAt` is older than `RUN_TIMEOUT`
    (AD-2) — i.e. the holding run exceeded the constitution §2.6 wall-clock cap and is
    presumed dead.
    """

    model_config = ConfigDict(extra="forbid")

    run_id: str
    date: str
    started_at: datetime
