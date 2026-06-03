"""Run-completion notifications (F-012).

`webpush` provides the `Notifier` port the orchestrator calls after finalizing a run, plus the
`WebPushNotifier` production implementation (pywebpush + VAPID). Push failure never fails a run
(PRD §275/§285): the notifier swallows send errors and prunes dead subscriptions.
"""

from minion.notify.webpush import Notifier, WebPushNotifier

__all__ = ["Notifier", "WebPushNotifier"]
