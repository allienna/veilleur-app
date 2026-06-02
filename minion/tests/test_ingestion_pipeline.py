"""End-to-end ingestion through `run_pipeline` with fake clients (T-3.5).

Covers the six spec scenarios: happy path, threshold-pass, threshold-fail, empty-mailbox
skip, paywall exclusion, and denylist filtering — driven through the real GmailStep / JinaStep
/ ValidateInputStep wired by `build_pipeline`, over the in-memory stores from conftest.
"""

from __future__ import annotations

import json
from datetime import datetime

import pytest

from minion import config
from minion.config import PARIS_TZ
from minion.generate.fakes import FakeGenerateRunner
from minion.ingest.fakes import FakeGmailClient, FakeJinaClient
from minion.ingest.models import Newsletter, ScrapedSource, SourceOutcome
from minion.models import Run, RunStatus
from minion.orchestrator import run_pipeline
from minion.steps import build_pipeline

DATE = "2026-06-01"
T0 = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)

# A valid `/generate` artefact so runs that pass validate_input flow through the real
# generation steps (F-005). Generation specifics are covered by test_generation_pipeline.py.
_VALID_ARTIFACT = json.dumps(
    {
        "theme": "ai",
        "frontmatter": {"title": "T", "date": "2026-06-02", "description": "d", "tags": ["ai"]},
        "body": "a clean synthesis body",
        "linkedin": "a post",
        "image_prompt": "a prompt",
    }
)


def _newsletter(sender: str, urls: list[str]) -> Newsletter:
    return Newsletter(sender=sender, subject="s", received_at=T0, candidate_urls=urls)


def _jina_with_outcomes(
    *, failed: list[str] | None = None, paywalled: list[str] | None = None
) -> FakeJinaClient:
    results = {u: ScrapedSource(url=u, outcome=SourceOutcome.failed) for u in failed or []}
    results |= {u: ScrapedSource(url=u, outcome=SourceOutcome.paywalled) for u in paywalled or []}
    return FakeJinaClient(results=results)


def _run(gmail: FakeGmailClient, jina: FakeJinaClient, run_store, lock_store, clock) -> Run:
    runner = FakeGenerateRunner(outputs=[_VALID_ARTIFACT])
    steps = build_pipeline(gmail, jina, runner)
    return run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)


def test_happy_path_succeeds_through_all_nine_steps(run_store, lock_store, clock) -> None:
    urls = [f"https://x.com/{i}" for i in range(5)]
    final = _run(
        FakeGmailClient([_newsletter("a@x.com", urls)]),
        FakeJinaClient(),
        run_store,
        lock_store,
        clock,
    )
    assert final.status is RunStatus.success
    assert len(final.steps) == 9
    assert all(s.status is RunStatus.success for s in final.steps)


def test_degraded_but_above_threshold_passes(run_store, lock_store, clock) -> None:
    urls = [f"https://x.com/{i}" for i in range(10)]
    jina = _jina_with_outcomes(failed=urls[6:])  # 6 ok of 10 → ≥5 and ≥50%
    final = _run(
        FakeGmailClient([_newsletter("a@x.com", urls)]), jina, run_store, lock_store, clock
    )
    assert final.status is RunStatus.success


def test_below_threshold_fails_the_run(run_store, lock_store, clock) -> None:
    urls = [f"https://x.com/{i}" for i in range(12)]
    jina = _jina_with_outcomes(failed=urls[3:])  # 3 ok of 12
    final = _run(
        FakeGmailClient([_newsletter("a@x.com", urls)]), jina, run_store, lock_store, clock
    )
    assert final.status is RunStatus.failure
    assert (
        final.error is not None and "insufficient_sources" in final.error and "3/12" in final.error
    )
    # validate_input failed; downstream steps never ran.
    statuses = {s.name.value: s.status for s in final.steps}
    assert statuses["validate_input"] is RunStatus.failure
    assert "generate" not in statuses


def test_empty_mailbox_skips_run(run_store, lock_store, clock) -> None:
    final = _run(FakeGmailClient([]), FakeJinaClient(), run_store, lock_store, clock)
    assert final.status is RunStatus.skipped
    assert final.error == "no_sources"
    names = [s.name.value for s in final.steps]
    assert names == ["gmail", "jina", "validate_input"]  # halted after the skip


def test_paywalled_sources_excluded_from_ok_count(run_store, lock_store, clock) -> None:
    urls = [f"https://x.com/{i}" for i in range(8)]
    jina = _jina_with_outcomes(paywalled=urls[4:])  # 4 ok + 4 paywalled
    final = _run(
        FakeGmailClient([_newsletter("a@x.com", urls)]), jina, run_store, lock_store, clock
    )
    # Paywalled don't count as OK → 4/8 < the ≥5 floor → the run fails.
    assert final.status is RunStatus.failure
    assert final.error is not None and "4/8" in final.error


def test_denylisted_sender_is_filtered(
    monkeypatch: pytest.MonkeyPatch, run_store, lock_store, clock
) -> None:
    monkeypatch.setattr(config, "EXCLUDED_SENDERS", frozenset({"@denied.com"}))
    gmail = FakeGmailClient(
        [_newsletter("spam@denied.com", [f"https://denied.com/{i}" for i in range(5)])]
    )
    final = _run(gmail, FakeJinaClient(), run_store, lock_store, clock)
    # The only sender is denied → no URLs → skipped, proving the filter took effect end-to-end.
    assert final.status is RunStatus.skipped
    assert final.error == "no_sources"
