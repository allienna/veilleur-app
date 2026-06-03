"""Run-level LLM cost/tokens capture through `run_pipeline` with fakes (F-011 T-2.2).

The generate step sums `total_cost_usd`/`usage` across every billed `/generate` call and the
orchestrator writes them to `runs/{date}`; a run that never reaches `generate` leaves them None.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from minion.config import PARIS_TZ
from minion.generate.fakes import FakeGenerateRunner
from minion.ingest.fakes import FakeGmailClient, FakeJinaClient
from minion.ingest.models import Newsletter
from minion.models import Run, RunStatus
from minion.orchestrator import run_pipeline
from minion.publish.fakes import FakeContentRepository, FakeImageGenerator, FakePromptRewriter
from minion.steps import build_pipeline
from minion.store.memory import InMemoryArticleStore

DATE = "2026-06-01"
T0 = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)
URLS = [f"https://x.com/{i}" for i in range(6)]  # ≥5 → passes validate_input


def _artifact(**overrides: Any) -> str:
    payload: dict[str, Any] = {
        "theme": "ai",
        "frontmatter": {"title": "T", "date": "2026-06-02", "description": "d", "tags": ["ai"]},
        "body": "a clean synthesis body",
        "linkedin": "a post",
        "image_prompt": "a prompt",
    }
    payload.update(overrides)
    return json.dumps(payload)


def _run(runner: FakeGenerateRunner, run_store, lock_store, clock, *, newsletters=None) -> Run:
    gmail = FakeGmailClient(
        newsletters
        if newsletters is not None
        else [Newsletter(sender="a@x.com", subject="s", received_at=T0, candidate_urls=URLS)]
    )
    steps = build_pipeline(
        gmail,
        FakeJinaClient(),
        runner,
        FakeImageGenerator(outcomes=[b"IMG"]),
        FakePromptRewriter(),
        FakeContentRepository(),
        InMemoryArticleStore(),
    )
    return run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)


def test_cost_and_tokens_written_on_success(run_store, lock_store, clock) -> None:
    runner = FakeGenerateRunner(outputs=[_artifact()], cost_usd=0.42, tokens=1200)
    final = _run(runner, run_store, lock_store, clock)
    assert final.status is RunStatus.success
    assert final.costUsd == 0.42
    assert final.tokens == 1200


def test_cost_summed_across_validation_retries(run_store, lock_store, clock) -> None:
    # One invalid attempt then a valid one — both calls are billed, so cost/tokens accumulate.
    runner = FakeGenerateRunner(
        outputs=[_artifact(linkedin="x" * 3001), _artifact()], cost_usd=0.1, tokens=100
    )
    final = _run(runner, run_store, lock_store, clock)
    assert final.status is RunStatus.success
    assert len(runner.calls) == 2
    assert final.costUsd == 0.2
    assert final.tokens == 200


def test_cost_null_when_generate_never_runs(run_store, lock_store, clock) -> None:
    # Empty mailbox → validate_input ends the run skipped/no_sources before `generate`.
    runner = FakeGenerateRunner(outputs=[_artifact()], cost_usd=0.42, tokens=1200)
    final = _run(runner, run_store, lock_store, clock, newsletters=[])
    assert final.status is RunStatus.skipped
    assert final.costUsd is None
    assert final.tokens is None


def test_cost_null_when_cli_reports_none(run_store, lock_store, clock) -> None:
    # CLI that doesn't emit usage (AD-5 fallback) → run cost stays null even on success.
    runner = FakeGenerateRunner(outputs=[_artifact()])
    final = _run(runner, run_store, lock_store, clock)
    assert final.status is RunStatus.success
    assert final.costUsd is None
    assert final.tokens is None
