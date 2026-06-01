"""Tests for the stub step registry."""

from __future__ import annotations

from datetime import datetime

from minion.clock import FrozenClock
from minion.config import PARIS_TZ, STEP_ORDER
from minion.logging import bind
from minion.models import StepName
from minion.steps import STEPS, StepContext


def test_steps_are_nine_in_canonical_order() -> None:
    assert len(STEPS) == 9
    assert tuple(s.name for s in STEPS) == STEP_ORDER


def test_each_stub_runs_without_raising() -> None:
    ctx = StepContext(
        run_id="RUN1",
        date="2026-06-01",
        clock=FrozenClock(datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)),
        log=bind("RUN1"),
    )
    for step in STEPS:
        result = step.run(ctx)
        assert result.payload is not None


def test_generate_stub_has_article_shape() -> None:
    generate = next(s for s in STEPS if s.name is StepName.generate)
    ctx = StepContext(
        run_id="RUN1",
        date="2026-06-01",
        clock=FrozenClock(datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)),
        log=bind("RUN1", step="generate"),
    )
    payload = generate.run(ctx).payload
    assert "article" in payload and "linkedin" in payload and "imagePrompt" in payload
