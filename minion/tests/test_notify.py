"""WebPushNotifier behaviour (F-012 T-3.3): sends on terminal statuses, silent on
skipped/no_sources, prunes dead subscriptions, and never raises (AC-5/6/7/8)."""

from __future__ import annotations

import json
from typing import Any

from veilleur_shared.push_subscription import PushSubscription
from veilleur_shared.run import Run, RunStatus, RunStep, StepName

from minion.notify.webpush import WebPushNotifier
from minion.store.memory import InMemorySubscriptionStore

DATE = "2026-06-03"
RUN_ID = "01J0PUSH"


def _sub(endpoint: str) -> PushSubscription:
    return PushSubscription.model_validate(
        {
            "endpoint": endpoint,
            "keys": {"p256dh": "p", "auth": "a"},
            "operatorEmail": "aurelien.allienne@gmail.com",
            "createdAt": "2026-06-03T06:00:00Z",
        }
    )


def _run(status: RunStatus, *, error: str | None = None, steps: list[RunStep] | None = None) -> Run:
    return Run(
        runId=RUN_ID,
        date=DATE,
        status=status,
        startedAt=None,
        endedAt=None,
        error=error,
        steps=steps or [],
    )


class _Recorder:
    """Stand-in for pywebpush.webpush; records each call's subscription_info + data."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def __call__(self, **kwargs: Any) -> None:
        self.calls.append(kwargs)


def _store(*endpoints: str) -> InMemorySubscriptionStore:
    return InMemorySubscriptionStore({f"id-{i}": _sub(e) for i, e in enumerate(endpoints)})


def test_success_sends_one_push_per_subscription() -> None:
    send = _Recorder()
    store = _store("https://push.example/a", "https://push.example/b")
    WebPushNotifier(store, "vapid-priv", send=send).notify(_run(RunStatus.success))
    assert len(send.calls) == 2
    payload = json.loads(send.calls[0]["data"])
    assert "disponible" in payload["body"]
    assert payload["url"] == f"/runs/{DATE}"
    assert send.calls[0]["vapid_claims"] == {"sub": "mailto:aurelien.allienne@gmail.com"}


def test_success_with_warnings_sends_with_warning_copy() -> None:
    send = _Recorder()
    WebPushNotifier(_store("https://push.example/a"), "k", send=send).notify(
        _run(RunStatus.success_with_warnings)
    )
    assert "avertissements" in json.loads(send.calls[0]["data"])["body"]


def test_no_sources_skip_sends_nothing() -> None:
    send = _Recorder()
    WebPushNotifier(_store("https://push.example/a"), "k", send=send).notify(
        _run(RunStatus.skipped, error="no_sources")
    )
    assert send.calls == []


def test_aborted_sends_nothing() -> None:
    send = _Recorder()
    WebPushNotifier(_store("https://push.example/a"), "k", send=send).notify(
        _run(RunStatus.aborted, error="already_running")
    )
    assert send.calls == []


def test_failure_sends_failed_push_naming_the_step() -> None:
    send = _Recorder()
    steps = [
        RunStep(name=StepName.gmail, status=RunStatus.success),
        RunStep(name=StepName.jina, status=RunStatus.failure, error="boom"),
    ]
    WebPushNotifier(_store("https://push.example/a"), "k", send=send).notify(
        _run(RunStatus.failure, error="jina_failed", steps=steps)
    )
    body = json.loads(send.calls[0]["data"])["body"]
    assert "échoué" in body and "jina" in body


def test_dead_subscription_is_pruned_on_410() -> None:
    from pywebpush import WebPushException

    class _Resp:
        status_code = 410

    def _send(**_kwargs: Any) -> None:
        raise WebPushException("gone", response=_Resp())  # type: ignore[arg-type]

    store = _store("https://push.example/a")
    WebPushNotifier(store, "k", send=_send).notify(_run(RunStatus.success))
    # Pruned → no subscriptions remain. Run status is untouched (no raise).
    assert store.list_subscriptions() == []


def test_generic_send_error_is_swallowed_and_keeps_subscription() -> None:
    def _send(**_kwargs: Any) -> None:
        raise RuntimeError("network down")

    store = _store("https://push.example/a")
    # Must not raise.
    WebPushNotifier(store, "k", send=_send).notify(_run(RunStatus.success))
    # A generic error does NOT prune the subscription (it may be transient).
    assert len(store.list_subscriptions()) == 1


def test_no_subscriptions_is_a_noop() -> None:
    send = _Recorder()
    WebPushNotifier(InMemorySubscriptionStore(), "k", send=send).notify(_run(RunStatus.success))
    assert send.calls == []
