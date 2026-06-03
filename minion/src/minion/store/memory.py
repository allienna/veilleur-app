"""Hermetic in-memory fakes for the store ports (AD-3).

These model exactly the two Firestore semantics the orchestrator relies on — overwrite-by-
date for runs and atomic compare-and-set (with stale reclaim) for the lock — and nothing
more. Real Firestore-transaction fidelity is exercised by F-007's deployed run.
"""

from __future__ import annotations

from datetime import datetime

from minion.clock import Clock
from minion.config import RUN_TIMEOUT, STEP_ORDER
from minion.models import Lock, Run, RunStatus, RunStep, StepName
from minion.publish.models import ArticleDoc


class InMemoryRunStore:
    """Run store backed by dicts. `start_run` overwrites and clears step children."""

    def __init__(self) -> None:
        self._runs: dict[str, dict[str, object]] = {}
        self._steps: dict[str, dict[StepName, RunStep]] = {}

    def start_run(self, run: Run) -> None:
        self._runs[run.date] = {
            "runId": run.runId,
            "status": run.status,
            "startedAt": run.startedAt,
            "endedAt": run.endedAt,
            "error": run.error,
        }
        self._steps[run.date] = {}  # clear prior children (idempotent replay)

    def upsert_step(self, date: str, step: RunStep) -> None:
        self._steps.setdefault(date, {})[step.name] = step

    def finalize_run(
        self,
        date: str,
        status: RunStatus,
        ended_at: datetime,
        error: str | None,
        cost_usd: float | None = None,
        tokens: int | None = None,
    ) -> None:
        doc = self._runs[date]
        doc["status"] = status
        doc["endedAt"] = ended_at
        doc["error"] = error
        doc["costUsd"] = cost_usd
        doc["tokens"] = tokens

    def get_run(self, date: str) -> Run | None:
        doc = self._runs.get(date)
        if doc is None:
            return None
        children = self._steps.get(date, {})
        steps = [children[name] for name in STEP_ORDER if name in children]
        return Run(
            runId=str(doc["runId"]),
            date=date,
            status=doc["status"],  # type: ignore[arg-type]
            startedAt=doc["startedAt"],  # type: ignore[arg-type]
            endedAt=doc["endedAt"],  # type: ignore[arg-type]
            error=doc["error"],  # type: ignore[arg-type]
            costUsd=doc.get("costUsd"),  # type: ignore[arg-type]
            tokens=doc.get("tokens"),  # type: ignore[arg-type]
            steps=steps,
        )


class InMemoryArticleStore:
    """Article store backed by a dict; `put_article` overwrites by date (idempotent replay)."""

    def __init__(self) -> None:
        self._articles: dict[str, ArticleDoc] = {}

    def put_article(self, date: str, article: ArticleDoc) -> None:
        self._articles[date] = article

    def get_article(self, date: str) -> ArticleDoc | None:
        return self._articles.get(date)


class InMemoryLockStore:
    """Global single-flight lock with stale reclaim, evaluated against an injected clock."""

    def __init__(self, clock: Clock) -> None:
        self._clock = clock
        self._lock: Lock | None = None

    def acquire(self, lock: Lock) -> bool:
        held = self._lock
        if held is not None and not self._is_stale(held):
            return False
        self._lock = lock  # fresh acquire or reclaim of a stale lock
        return True

    def release(self, run_id: str) -> None:
        if self._lock is not None and self._lock.run_id == run_id:
            self._lock = None

    def _is_stale(self, held: Lock) -> bool:
        return held.started_at < self._clock.now() - RUN_TIMEOUT
