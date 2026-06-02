"""Unit tests for the budget kill-switch logic (F-007 T-2.6).

Hermetic: targets killswitch.py with dict payloads + a fake Scheduler client, so it needs only
pytest (no functions-framework, no google-cloud-scheduler).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from killswitch import budget_ratio, pause_scheduler, should_pause


def test_ratio_at_and_over_budget_pauses() -> None:
    assert should_pause(budget_ratio({"costAmount": 30.0, "budgetAmount": 30.0})) is True
    assert should_pause(budget_ratio({"costAmount": 31.5, "budgetAmount": 30.0})) is True


def test_ratio_under_budget_does_not_pause() -> None:
    assert should_pause(budget_ratio({"costAmount": 24.0, "budgetAmount": 30.0})) is False


def test_zero_or_missing_budget_is_safe() -> None:
    assert budget_ratio({}) == 0.0
    assert budget_ratio({"costAmount": 10.0, "budgetAmount": 0}) == 0.0
    assert should_pause(0.0) is False


@dataclass
class _FakeSchedulerClient:
    paused: list[str] = field(default_factory=list)

    def pause_job(self, name: str) -> None:
        self.paused.append(name)


def test_pause_scheduler_targets_the_daily_job() -> None:
    client = _FakeSchedulerClient()
    pause_scheduler("veilleur-app", "europe-west1", "minion-daily", client=client)
    assert client.paused == [
        "projects/veilleur-app/locations/europe-west1/jobs/minion-daily"
    ]
