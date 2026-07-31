"""Tests for deterministic context assembly (T-2.1, FR-1)."""

from __future__ import annotations

import pytest

from minion import config
from minion.generate.assemble import assemble_context
from minion.ingest.models import ScrapedSource, SourceOutcome, SourceSet
from minion.logging import bind

LOG = bind("RUN")


def _ok(i: int, markdown: str = "body") -> ScrapedSource:
    return ScrapedSource(
        url=f"https://s.io/{i}", outcome=SourceOutcome.ok, title=f"T{i}", markdown=markdown
    )


def test_selects_only_ok_sources_in_order() -> None:
    source_set = SourceSet(
        sources=[
            _ok(0),
            ScrapedSource(url="https://pay.io", outcome=SourceOutcome.paywalled),
            _ok(1),
            ScrapedSource(url="https://down.io", outcome=SourceOutcome.failed),
            _ok(2),
        ]
    )
    context = assemble_context(source_set, log=LOG)
    assert [s.url for s in context.sources] == [
        "https://s.io/0",
        "https://s.io/1",
        "https://s.io/2",
    ]


def test_carries_title_and_markdown() -> None:
    context = assemble_context(SourceSet(sources=[_ok(0, markdown="# heading\n\ntext")]), log=LOG)
    assert context.sources[0].title == "T0"
    assert context.sources[0].markdown == "# heading\n\ntext"


def test_truncates_to_input_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    # Tiny budget so only the first couple of sources fit; the rest are dropped.
    monkeypatch.setattr(config, "MAX_GENERATE_INPUT_TOKENS", 30)
    big = "x" * 40  # ~10 tokens of markdown alone, plus url/title
    source_set = SourceSet(sources=[_ok(i, markdown=big) for i in range(10)])
    context = assemble_context(source_set, log=LOG)
    assert 0 < len(context.sources) < 10  # truncated


def test_empty_source_set_yields_empty_context() -> None:
    assert assemble_context(SourceSet(sources=[]), log=LOG).sources == []


def test_dedupes_by_title_keeping_first_seen() -> None:
    # Same article syndicated across two newsletter editions with distinct tracking URLs but an
    # identical title — only the first-seen copy should survive (2026-07-31 burn-in).
    dup = ScrapedSource(
        url="https://tracking.example.com/edition-a/real-post",
        outcome=SourceOutcome.ok,
        title="How ChatGPT Optimizes Its Agent Loop",
        markdown="body a",
    )
    dup_other_edition = ScrapedSource(
        url="https://tracking.example.com/edition-b/real-post",
        outcome=SourceOutcome.ok,
        title="How ChatGPT Optimizes Its Agent Loop",
        markdown="body b",
    )
    context = assemble_context(SourceSet(sources=[dup, dup_other_edition, _ok(0)]), log=LOG)
    assert [s.url for s in context.sources] == [
        "https://tracking.example.com/edition-a/real-post",
        "https://s.io/0",
    ]
