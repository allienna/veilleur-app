# pyright: basic
# ^ google-cloud-firestore ships incomplete type stubs (see pyproject reportMissingTypeStubs);
#   this SDK-boundary adapter is dropped to basic checking. Its behaviour is covered by the
#   in-memory fakes (AD-3) and proven against real Firestore in F-007.
"""Production Cloud Firestore adapters for the store ports.

Behavioural coverage lives in the in-memory fakes (AD-3); this module is type-checked only
under F-003 and exercised for real by F-007's deployed run. The lock adapter performs
acquire/release inside a Firestore transaction so the global single-flight guard is atomic.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from google.cloud import firestore

from minion.clock import Clock
from minion.config import (
    ARTICLES_COLLECTION,
    LOCK_DOC_ID,
    LOCKS_COLLECTION,
    RUN_TIMEOUT,
    RUNS_COLLECTION,
    STEP_ORDER,
    STEPS_SUBCOLLECTION,
)
from minion.models import Lock, Run, RunStatus, RunStep, StepName
from minion.publish.models import ArticleDoc


def _step_to_doc(step: RunStep) -> dict[str, Any]:
    return {
        "name": step.name.value,
        "status": step.status.value,
        "startedAt": step.startedAt,
        "endedAt": step.endedAt,
        "error": step.error,
    }


class FirestoreRunStore:
    """`runs/{date}` documents plus a `steps/{stepName}` subcollection per run."""

    def __init__(self, client: firestore.Client) -> None:
        self._client = client

    def _run_ref(self, date: str) -> Any:
        return self._client.collection(RUNS_COLLECTION).document(date)

    def start_run(self, run: Run) -> None:
        run_ref = self._run_ref(run.date)
        # Clear any prior step children so a replay leaves no orphans (AC-4).
        steps_col = run_ref.collection(STEPS_SUBCOLLECTION)
        for child in steps_col.list_documents():
            child.delete()
        run_ref.set(
            {
                "runId": run.runId,
                "date": run.date,
                "status": run.status.value,
                "startedAt": run.startedAt,
                "endedAt": run.endedAt,
                "error": run.error,
            }
        )

    def upsert_step(self, date: str, step: RunStep) -> None:
        self._run_ref(date).collection(STEPS_SUBCOLLECTION).document(step.name.value).set(
            _step_to_doc(step)
        )

    def finalize_run(
        self, date: str, status: RunStatus, ended_at: datetime, error: str | None
    ) -> None:
        self._run_ref(date).update({"status": status.value, "endedAt": ended_at, "error": error})

    def get_run(self, date: str) -> Run | None:
        snapshot = self._run_ref(date).get()
        if not snapshot.exists:
            return None
        doc = cast("dict[str, Any]", snapshot.to_dict())
        children: dict[StepName, RunStep] = {}
        for child in self._run_ref(date).collection(STEPS_SUBCOLLECTION).stream():
            data = cast("dict[str, Any]", child.to_dict())
            name = StepName(data["name"])
            children[name] = RunStep(
                name=name,
                status=RunStatus(data["status"]),
                startedAt=data.get("startedAt"),
                endedAt=data.get("endedAt"),
                error=data.get("error"),
            )
        steps = [children[name] for name in STEP_ORDER if name in children]
        return Run(
            runId=doc["runId"],
            date=date,
            status=RunStatus(doc["status"]),
            startedAt=doc.get("startedAt"),
            endedAt=doc.get("endedAt"),
            error=doc.get("error"),
            steps=steps,
        )


class FirestoreArticleStore:
    """`articles/{date}` documents — the published article the PWA reads (F-006 plan AD-3)."""

    def __init__(self, client: firestore.Client) -> None:
        self._client = client

    def _article_ref(self, date: str) -> Any:
        return self._client.collection(ARTICLES_COLLECTION).document(date)

    def put_article(self, date: str, article: ArticleDoc) -> None:
        # Full overwrite (no merge) so a replay leaves no stale fields (constitution §2.7).
        self._article_ref(date).set(article.model_dump(mode="json"))

    def get_article(self, date: str) -> ArticleDoc | None:
        snapshot = self._article_ref(date).get()
        if not snapshot.exists:
            return None
        return ArticleDoc.model_validate(cast("dict[str, Any]", snapshot.to_dict()))


class FirestoreLockStore:
    """The global `locks/minion` lock, acquired/released transactionally."""

    def __init__(self, client: firestore.Client, clock: Clock) -> None:
        self._client = client
        self._clock = clock

    def _lock_ref(self) -> Any:
        return self._client.collection(LOCKS_COLLECTION).document(LOCK_DOC_ID)

    def acquire(self, lock: Lock) -> bool:
        lock_ref = self._lock_ref()
        now = self._clock.now()

        @firestore.transactional  # type: ignore[misc]  # google stubs leave the decorator untyped
        def _acquire(transaction: firestore.Transaction) -> bool:
            snapshot = lock_ref.get(transaction=transaction)
            if snapshot.exists:
                held = cast("dict[str, Any]", snapshot.to_dict())
                started_at = cast(datetime, held["started_at"])
                if started_at >= now - RUN_TIMEOUT:  # still live → cannot acquire
                    return False
            transaction.set(
                lock_ref,
                {"run_id": lock.run_id, "date": lock.date, "started_at": lock.started_at},
            )
            return True

        return cast(bool, _acquire(self._client.transaction()))

    def release(self, run_id: str) -> None:
        lock_ref = self._lock_ref()

        @firestore.transactional  # type: ignore[misc]  # google stubs leave the decorator untyped
        def _release(transaction: firestore.Transaction) -> None:
            snapshot = lock_ref.get(transaction=transaction)
            if snapshot.exists:
                held = cast("dict[str, Any]", snapshot.to_dict())
                if held.get("run_id") == run_id:
                    transaction.delete(lock_ref)

        _release(self._client.transaction())
