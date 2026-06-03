"""SubscriptionStore semantics (F-012 T-3.2): in-memory list/delete, and the Firestore adapter
validating each document against the shared schema at the boundary (constitution §4)."""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError
from veilleur_shared.push_subscription import PushSubscription

from minion.store.firestore import FirestoreSubscriptionStore
from minion.store.memory import InMemorySubscriptionStore


def _sub(endpoint: str = "https://push.example/abc") -> PushSubscription:
    return PushSubscription.model_validate(
        {
            "endpoint": endpoint,
            "keys": {"p256dh": "p", "auth": "a"},
            "operatorEmail": "aurelien.allienne@gmail.com",
            "createdAt": "2026-06-03T06:00:00Z",
        }
    )


def test_in_memory_list_and_delete() -> None:
    store = InMemorySubscriptionStore({"id-1": _sub()})
    assert [s.id for s in store.list_subscriptions()] == ["id-1"]
    store.delete("id-1")
    assert store.list_subscriptions() == []
    store.delete("id-1")  # idempotent — no raise


# --- Firestore adapter against a duck-typed fake client ----------------------------------


class _FakeSnapshot:
    def __init__(self, doc_id: str, data: dict[str, Any]) -> None:
        self.id = doc_id
        self._data = data

    def to_dict(self) -> dict[str, Any]:
        return self._data


class _FakeDocRef:
    def __init__(self, sink: list[str], doc_id: str) -> None:
        self._sink = sink
        self._id = doc_id

    def delete(self) -> None:
        self._sink.append(self._id)


class _FakeCollection:
    def __init__(self, snapshots: list[_FakeSnapshot], deleted: list[str]) -> None:
        self._snapshots = snapshots
        self._deleted = deleted

    def stream(self) -> list[_FakeSnapshot]:
        return self._snapshots

    def document(self, doc_id: str) -> _FakeDocRef:
        return _FakeDocRef(self._deleted, doc_id)


class _FakeClient:
    def __init__(self, snapshots: list[_FakeSnapshot]) -> None:
        self._snapshots = snapshots
        self.deleted: list[str] = []

    def collection(self, _name: str) -> _FakeCollection:
        return _FakeCollection(self._snapshots, self.deleted)


def test_firestore_adapter_returns_validated_models() -> None:
    snap = _FakeSnapshot("hash-1", _sub().model_dump(mode="json"))
    store = FirestoreSubscriptionStore(_FakeClient([snap]))  # type: ignore[arg-type]
    out = store.list_subscriptions()
    assert len(out) == 1
    assert out[0].id == "hash-1"
    assert str(out[0].data.endpoint) == "https://push.example/abc"


def test_firestore_adapter_raises_on_malformed_doc() -> None:
    bad = _FakeSnapshot("hash-bad", {"endpoint": "https://x/y"})  # missing keys/operatorEmail
    store = FirestoreSubscriptionStore(_FakeClient([bad]))  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        store.list_subscriptions()


def test_firestore_adapter_delete_targets_the_document() -> None:
    client = _FakeClient([])
    store = FirestoreSubscriptionStore(client)  # type: ignore[arg-type]
    store.delete("hash-9")
    assert client.deleted == ["hash-9"]
