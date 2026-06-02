"""Cloud Function (2nd gen) entrypoint for the budget kill-switch (F-007 FR-5).

Triggered by the Pub/Sub topic the billing budget publishes to. On a ≥100%-of-budget event it
pauses the `minion-daily` Cloud Scheduler job. The decode/decision/pause logic lives in
`killswitch.py` (unit-tested without GCP deps); this module is the thin functions-framework shim.

Env: PROJECT_ID, REGION, SCHEDULER_JOB (defaulted to the production names).
"""

from __future__ import annotations

import base64
import json
import logging
import os

import functions_framework

from killswitch import budget_ratio, pause_scheduler, should_pause

_log = logging.getLogger("budget-killswitch")


@functions_framework.cloud_event
def on_budget_event(cloud_event) -> None:  # type: ignore[no-untyped-def]
    """Pause the daily Scheduler job when spend reaches 100% of the budget."""
    message = cloud_event.data.get("message", {})
    raw = message.get("data")
    payload = json.loads(base64.b64decode(raw).decode("utf-8")) if raw else {}

    ratio = budget_ratio(payload)
    if not should_pause(ratio):
        _log.info("budget at %.0f%% — below kill threshold, no action", ratio * 100)
        return

    project = os.environ.get("PROJECT_ID", "veilleur-app")
    region = os.environ.get("REGION", "europe-west1")
    job = os.environ.get("SCHEDULER_JOB", "minion-daily")
    pause_scheduler(project, region, job)
    _log.warning("budget at %.0f%% — paused Scheduler job %s (kill-switch)", ratio * 100, job)
