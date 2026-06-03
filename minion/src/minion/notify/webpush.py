"""Web Push sender (F-012 FR-5/FR-6).

Called by the orchestrator *after* the run is finalized, so it sees the terminal status and
reason for every path (success / success_with_warnings / failure / skipped). It is silent on a
`skipped` run (an empty mailbox, `reason == "no_sources"`, must not notify — PRD §267) and on
any other non-notifying terminal status. A push failure is never a run failure (PRD §275/§285):
dead subscriptions (HTTP 410/404) are pruned and every other send error is logged and
swallowed — `notify` never raises into `run_pipeline`.
"""

from __future__ import annotations

import json
from typing import Any, Protocol

from pywebpush import WebPushException, webpush
from veilleur_shared.run import Run, RunStatus

from minion.config import VAPID_SUBJECT
from minion.logging import bind
from minion.store.ports import StoredSubscription, SubscriptionStore

# Terminal statuses that warrant a notification. `skipped` (incl. no_sources) and `aborted`
# are intentionally silent.
_NOTIFY_STATUSES: frozenset[RunStatus] = frozenset(
    {RunStatus.success, RunStatus.success_with_warnings, RunStatus.failure}
)

# HTTP statuses from a push service meaning "this subscription is gone" → prune it.
_DEAD_SUBSCRIPTION_STATUSES: frozenset[int] = frozenset({404, 410})


class Notifier(Protocol):
    """Sends a run-completion notification. Implementations MUST NOT raise (FR-5 soft-fail)."""

    def notify(self, run: Run) -> None: ...


def _build_payload(run: Run) -> dict[str, str]:
    """Notification title/body keyed off the terminal status, plus the in-app deep-link url."""
    url = f"/runs/{run.date}"
    if run.status is RunStatus.failure:
        failed = next((s.name.value for s in run.steps if s.status is RunStatus.failure), None)
        body = f"Run échoué à l'étape {failed}." if failed else "Run échoué."
        return {"title": "Le Veilleur — échec", "body": body, "url": url}
    if run.status is RunStatus.success_with_warnings:
        return {
            "title": "Le Veilleur — article prêt",
            "body": "Votre article du jour est publié (avec avertissements).",
            "url": url,
        }
    return {
        "title": "Le Veilleur — article prêt",
        "body": "Votre article du jour est disponible.",
        "url": url,
    }


class WebPushNotifier:
    """Sends Web Push via pywebpush, signing with the VAPID private key. The key is injected
    (the CLI fetches it from Secret Manager) so this class never touches Secret Manager."""

    def __init__(
        self,
        subscriptions: SubscriptionStore,
        vapid_private_key: str,
        *,
        vapid_subject: str = VAPID_SUBJECT,
        send: Any = webpush,
    ) -> None:
        self._subscriptions = subscriptions
        self._vapid_private_key = vapid_private_key
        self._vapid_subject = vapid_subject
        self._send = send

    def notify(self, run: Run) -> None:
        log = bind(run.runId, step="notify")
        if run.status not in _NOTIFY_STATUSES:
            # skipped/no_sources and aborted are deliberately silent (FR-E2, PRD §267).
            log.info(
                "no push for terminal status",
                extra={"status": run.status.value, "reason": run.error},
            )
            return

        subscriptions = self._subscriptions.list_subscriptions()
        if not subscriptions:
            log.info("no push subscriptions; nothing to send")
            return

        payload = json.dumps(_build_payload(run))
        sent = 0
        for stored in subscriptions:
            if self._send_one(stored, payload, log):
                sent += 1
        log.info("push notifications sent", extra={"sent": sent, "total": len(subscriptions)})

    def _send_one(self, stored: StoredSubscription, payload: str, log: Any) -> bool:
        """Send to one subscription. Returns True on success; prunes dead subs; never raises."""
        sub = stored.data
        try:
            self._send(
                subscription_info={
                    "endpoint": str(sub.endpoint),
                    "keys": {"p256dh": sub.keys.p256dh, "auth": sub.keys.auth},
                },
                data=payload,
                vapid_private_key=self._vapid_private_key,
                vapid_claims={"sub": self._vapid_subject},
            )
            return True
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in _DEAD_SUBSCRIPTION_STATUSES:
                self._subscriptions.delete(stored.id)
                log.info(
                    "pruned dead push subscription",
                    extra={"subscriptionId": stored.id, "status": status},
                )
            else:
                log.warning(
                    "push send failed",
                    extra={"subscriptionId": stored.id, "status": status, "error": str(exc)},
                )
            return False
        except Exception as exc:
            log.warning("push send error", extra={"subscriptionId": stored.id, "error": str(exc)})
            return False
