"""Tests for the stub step registry and the real-pipeline factory."""

from __future__ import annotations

from datetime import datetime

from minion.clock import FrozenClock
from minion.config import PARIS_TZ, STEP_ORDER
from minion.generate.fakes import FakeGenerateRunner
from minion.ingest.fakes import FakeGmailClient, FakeJinaClient
from minion.logging import bind
from minion.models import StepName
from minion.steps import STEPS, StepContext, build_pipeline
from minion.steps.generation import AssembleStep, GenerateStep, ValidateOutputStep
from minion.steps.ingestion import GmailStep, JinaStep, ValidateInputStep


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


def test_build_pipeline_wires_real_steps_and_keeps_order() -> None:
    pipeline = build_pipeline(FakeGmailClient(), FakeJinaClient(), FakeGenerateRunner())
    assert len(pipeline) == 9
    assert tuple(s.name for s in pipeline) == STEP_ORDER
    by_name = {s.name: s for s in pipeline}
    assert isinstance(by_name[StepName.gmail], GmailStep)
    assert isinstance(by_name[StepName.jina], JinaStep)
    assert isinstance(by_name[StepName.validate_input], ValidateInputStep)
    assert isinstance(by_name[StepName.assemble], AssembleStep)
    assert isinstance(by_name[StepName.generate], GenerateStep)
    assert isinstance(by_name[StepName.validate_output], ValidateOutputStep)
    # The remaining three slots stay stubs (F-006/F-012 replace them).
    real_types = (
        GmailStep,
        JinaStep,
        ValidateInputStep,
        AssembleStep,
        GenerateStep,
        ValidateOutputStep,
    )
    assert not isinstance(by_name[StepName.imagen], real_types)
    assert not isinstance(by_name[StepName.github], real_types)
    assert not isinstance(by_name[StepName.publish], real_types)
