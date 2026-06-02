"""Budget kill-switch logic (F-007 FR-5) — pure + lazily-importing helpers.

Kept separate from `main.py` (the functions-framework entrypoint) so the unit test needs neither
`functions-framework` nor `google-cloud-scheduler`: the google client is imported lazily inside
`pause_scheduler` and is injectable. On a ≥100%-of-budget event the function pauses the daily
Cloud Scheduler job, stopping all further automated runs until a human re-enables it (constitution
§2.10 — re-enabling is manual; disabling the kill-switch itself requires a PR).
"""

from __future__ import annotations

from typing import Any


def budget_ratio(event_data: dict[str, Any]) -> float:
    """Cost-to-budget ratio from a Cloud Billing budget notification payload.

    Returns 0.0 if the budget amount is missing/zero (cannot have overrun a zero budget)."""
    cost = float(event_data.get("costAmount", 0) or 0)
    budget = float(event_data.get("budgetAmount", 0) or 0)
    return cost / budget if budget > 0 else 0.0


def should_pause(ratio: float) -> bool:
    """True once spend reaches 100% of the budget (the kill threshold)."""
    return ratio >= 1.0


def pause_scheduler(project: str, region: str, job: str, client: Any | None = None) -> None:
    """Pause the daily Scheduler job. The google client is imported lazily so importing this
    module (and unit-testing it) needs no GCP SDK; tests inject a fake `client`."""
    if client is None:  # pragma: no cover - exercised only in the deployed function
        from google.cloud import scheduler_v1

        client = scheduler_v1.CloudSchedulerClient()
    name = f"projects/{project}/locations/{region}/jobs/{job}"
    client.pause_job(name=name)
