"""Firestore writer for the Hello-Veilleur spike.

Writes one SpikeRunRecord per invocation to `runs/{run_id}`. Replay overwrites by run_id
(idempotency by design, constitution §2 principle 7 — preview for F-003 which extends to
per-step subcollection writes).
"""

from __future__ import annotations

from google.cloud import firestore as _gcf

from minion.spike.models import SpikeRunRecord

PROJECT_ID = "veilleur-app"
DATABASE = "(default)"
COLLECTION = "runs"


_CLIENT: _gcf.Client | None = None


def _client() -> _gcf.Client:
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = _gcf.Client(project=PROJECT_ID, database=DATABASE)
    return _CLIENT


def write_run(record: SpikeRunRecord) -> None:
    """Write `record` to `runs/{record.run_id}`. Idempotent overwrite by run_id."""
    doc_ref = _client().collection(COLLECTION).document(record.run_id)
    doc_ref.set(record.model_dump(mode="json"))
