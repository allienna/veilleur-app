"""Static configuration constants for the Minion orchestrator.

Module-level constants only — no side effects, no I/O. The 20-minute run timeout is the
constitution §2.6 hard cap; F-003 does not enforce it in-process (that is the Cloud Run
Job `timeout` in F-007), but the stale-lock reclaim (AD-2) reuses it as a TTL.
"""

from __future__ import annotations

from datetime import timedelta
from zoneinfo import ZoneInfo

from veilleur_shared.run import StepName

# Wall-clock ceiling for a single run (constitution §2.6). Reused as the lock-staleness TTL.
RUN_TIMEOUT: timedelta = timedelta(minutes=20)

# All run timestamps and the daily date key are computed in this zone (PRD: Europe/Paris).
PARIS_TZ: ZoneInfo = ZoneInfo("Europe/Paris")

# Firestore collection / document layout (AD-1, AD-2).
RUNS_COLLECTION: str = "runs"  # runs/{date}, runs/{date}/steps/{stepName}
STEPS_SUBCOLLECTION: str = "steps"
LOCKS_COLLECTION: str = "locks"  # locks/{LOCK_DOC_ID}
LOCK_DOC_ID: str = "minion"  # single global lock (global single-flight)

# The nine canonical pipeline steps, in execution order (the StepName enum is declaration
# ordered to match the pipeline; constitution §2.9 observability is per this set).
STEP_ORDER: tuple[StepName, ...] = tuple(StepName)
