"""Persistence ports — the only Firestore surface the orchestrator knows about.

Firestore layout (AD-1, AD-2):

    runs/{date}                     run-level document (runId, status, timestamps, error)
    runs/{date}/steps/{stepName}    one observable child per step (constitution §2.9)
    locks/{minion}                  the single global concurrency lock
    articles/{date}                 the published article the PWA reads (F-006)

The schema's `Run.steps` array is the *assembled* view: `get_run` merges the run-level
document with its step subcollection into a schema-valid `Run` (AC-2). Replaying a date
overwrites the same `runs/{date}` document and clears its step children (AC-4).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from veilleur_shared.push_subscription import PushSubscription

from minion.models import Lock, Run, RunStatus, RunStep
from minion.publish.models import ArticleDoc


@dataclass(frozen=True)
class StoredSubscription:
    """A persisted push subscription plus its Firestore document id (sha256(endpoint)). The id
    lets the notifier prune a dead subscription (410/404) by document (F-012 AD-2/AD-4)."""

    id: str
    data: PushSubscription


class RunStore(Protocol):
    """Reads and writes run documents and their per-step children."""

    def start_run(self, run: Run) -> None:
        """Overwrite `runs/{run.date}` with the initial running document and clear any
        existing step children (idempotent replay)."""
        ...

    def upsert_step(self, date: str, step: RunStep) -> None:
        """Write/overwrite `runs/{date}/steps/{step.name}`."""
        ...

    def finalize_run(
        self,
        date: str,
        status: RunStatus,
        ended_at: datetime,
        error: str | None,
        cost_usd: float | None = None,
        tokens: int | None = None,
    ) -> None:
        """Set the terminal `status`, `endedAt`, run-level `error`, and the LLM `cost_usd`/`tokens`
        on `runs/{date}`. Cost/tokens are None when the run never reached `generate` (F-011)."""
        ...

    def get_run(self, date: str) -> Run | None:
        """Assemble the full `Run` (run-level fields + ordered step children), or None."""
        ...


class LockStore(Protocol):
    """The global single-flight concurrency guard (constitution §2.8)."""

    def acquire(self, lock: Lock) -> bool:
        """Atomically take the lock. Returns True if acquired — either no lock was held, or
        the held lock was stale (its `started_at` older than `RUN_TIMEOUT`) and reclaimed.
        Returns False if a live lock is held by another run."""
        ...

    def release(self, run_id: str) -> None:
        """Release the lock iff it is currently held by `run_id` (no-op otherwise)."""
        ...


class ArticleStore(Protocol):
    """Reads and writes the published article document the PWA renders (F-006 plan AD-3)."""

    def put_article(self, date: str, article: ArticleDoc) -> None:
        """Overwrite `articles/{date}` with `article` (idempotent by date, constitution §2.7)."""
        ...

    def get_article(self, date: str) -> ArticleDoc | None:
        """Return the article persisted for `date`, or None."""
        ...


class SubscriptionStore(Protocol):
    """Reads the operator's Web Push subscriptions (written client-side by the PWA) and prunes
    dead ones (F-012 AD-4). The Minion reads these server-side, bypassing Firestore Rules."""

    def list_subscriptions(self) -> list[StoredSubscription]:
        """Return every stored subscription, each validated against the shared schema."""
        ...

    def delete(self, subscription_id: str) -> None:
        """Delete `pushSubscriptions/{subscription_id}` (idempotent — no-op if absent)."""
        ...
