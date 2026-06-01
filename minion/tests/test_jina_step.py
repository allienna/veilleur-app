"""Tests for JinaStep over FakeJinaClient (T-3.2)."""

from __future__ import annotations

from datetime import datetime

from minion.clock import FrozenClock
from minion.config import PARIS_TZ
from minion.ingest.fakes import FakeJinaClient
from minion.ingest.models import ScrapedSource, SourceOutcome, SourceSet
from minion.logging import bind
from minion.steps.base import StepContext
from minion.steps.ingestion import JinaStep

T0 = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)


def _ctx(candidate_urls: list[str]) -> StepContext:
    return StepContext(
        run_id="RUN",
        date="2026-06-01",
        clock=FrozenClock(T0),
        log=bind("RUN"),
        data={"candidate_urls": candidate_urls},
    )


def test_scrapes_urls_into_source_set() -> None:
    result = JinaStep(client=FakeJinaClient()).run(_ctx(["https://a.io/1", "https://a.io/2"]))
    sources = result.payload["sources"]
    assert isinstance(sources, SourceSet)
    assert [s.url for s in sources.sources] == ["https://a.io/1", "https://a.io/2"]
    assert sources.ok_count == 2


def test_preserves_paywalled_and_failed_outcomes() -> None:
    client = FakeJinaClient(
        results={
            "https://pay.io/x": ScrapedSource(
                url="https://pay.io/x", outcome=SourceOutcome.paywalled
            ),
            "https://down.io/y": ScrapedSource(
                url="https://down.io/y", outcome=SourceOutcome.failed
            ),
        }
    )
    result = JinaStep(client=client).run(
        _ctx(["https://ok.io/0", "https://pay.io/x", "https://down.io/y"])
    )
    sources = result.payload["sources"]
    assert isinstance(sources, SourceSet)
    assert sources.total == 3
    assert sources.ok_count == 1  # paywalled + failed excluded from OK


def test_empty_candidate_urls_yields_empty_source_set() -> None:
    result = JinaStep(client=FakeJinaClient()).run(_ctx([]))
    sources = result.payload["sources"]
    assert isinstance(sources, SourceSet)
    assert sources.total == 0
