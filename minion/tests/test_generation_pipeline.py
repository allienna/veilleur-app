"""End-to-end generation through `run_pipeline` with fakes (T-3.7).

Drives the full nine-step pipeline (real ingestion + generation steps, stubs for the rest)
over the in-memory stores, covering the generation scenarios: happy path,
validation-retry-then-pass, retry-exhausted failure, transport-error failure, theme default,
and a copyright rejection that exhausts retries.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

import pytest

from minion import config
from minion.config import PARIS_TZ
from minion.generate.fakes import FakeGenerateRunner
from minion.generate.ports import GenerateTransportError
from minion.ingest.fakes import FakeGmailClient, FakeScraperClient
from minion.ingest.models import Newsletter, ScrapedSource, SourceOutcome
from minion.models import Run, RunStatus
from minion.orchestrator import run_pipeline
from minion.publish.fakes import (
    FakeContentRepository,
    FakeImageGenerator,
    FakePromptRewriter,
)
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


def _run(
    runner: FakeGenerateRunner,
    run_store,
    lock_store,
    clock,
    *,
    jina: FakeScraperClient | None = None,
) -> Run:
    gmail = FakeGmailClient(
        [Newsletter(sender="a@x.com", subject="s", received_at=T0, candidate_urls=URLS)]
    )
    steps = build_pipeline(
        gmail,
        jina or FakeScraperClient(),
        runner,
        FakeImageGenerator(outcomes=[b"IMG"]),
        FakePromptRewriter(),
        FakeContentRepository(),
        InMemoryArticleStore(),
    )
    return run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)


def test_happy_path_succeeds_through_all_nine_steps(run_store, lock_store, clock) -> None:
    final = _run(FakeGenerateRunner(outputs=[_artifact()]), run_store, lock_store, clock)
    assert final.status is RunStatus.success
    assert len(final.steps) == 9
    assert all(s.status is RunStatus.success for s in final.steps)


def test_validation_retry_then_pass_still_succeeds(run_store, lock_store, clock) -> None:
    runner = FakeGenerateRunner(outputs=[_artifact(linkedin="x" * 3001), _artifact()])
    final = _run(runner, run_store, lock_store, clock)
    assert final.status is RunStatus.success
    assert len(runner.calls) == 2  # one validation retry


def test_validation_retry_exhausted_fails_run(run_store, lock_store, clock) -> None:
    runner = FakeGenerateRunner(outputs=[_artifact(linkedin="x" * 3001)])  # always invalid
    final = _run(runner, run_store, lock_store, clock)
    assert final.status is RunStatus.failure
    assert final.error is not None and "linkedin_too_long" in final.error
    statuses = {s.name.value: s.status for s in final.steps}
    assert statuses["generate"] is RunStatus.failure
    assert "validate_output" not in statuses  # halted at generate


def test_transport_error_fails_run(
    monkeypatch: pytest.MonkeyPatch, run_store, lock_store, clock
) -> None:
    monkeypatch.setattr(config, "CLAUDE_BACKOFF_BASE", timedelta(0))  # no real sleeping
    runner = FakeGenerateRunner(error=GenerateTransportError("boom"))
    final = _run(runner, run_store, lock_store, clock)
    assert final.status is RunStatus.failure
    assert len(runner.calls) == 3  # initial + 2 transport retries


def test_unknown_theme_normalized_run_succeeds(run_store, lock_store, clock) -> None:
    final = _run(
        FakeGenerateRunner(outputs=[_artifact(theme="quantum")]), run_store, lock_store, clock
    )
    assert final.status is RunStatus.success


def test_copyright_reproduction_exhausts_retries_and_fails(run_store, lock_store, clock) -> None:
    # ≥ WHOLESALE_NGRAM (20) tokens of verbatim shared text so a genuine passage-level copy is
    # still caught after the burn-in recalibration.
    reproduced = (
        "the quick brown fox jumps over the lazy dog again and again over the hill today "
        "while the slow green turtle quietly watches the wide river flow past the old stone bridge"
    )
    jina = FakeScraperClient(
        results={
            URLS[0]: ScrapedSource(
                url=URLS[0], outcome=SourceOutcome.ok, title="Src", markdown=reproduced
            )
        }
    )
    runner = FakeGenerateRunner(outputs=[_artifact(body=reproduced)])  # verbatim, always
    final = _run(runner, run_store, lock_store, clock, jina=jina)
    assert final.status is RunStatus.failure
    assert final.error is not None and "wholesale_reproduction" in final.error
