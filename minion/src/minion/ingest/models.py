"""Minion-internal ingestion boundary models (F-004 AD-6).

These are *not* part of the PWA-facing shared schema (`shared/schema/*.json`); they are
intermediate pipeline values carried in the orchestrator data bag between the `gmail`,
`jina`, and `validate_input` steps. Every value crossing a step boundary is one of these
Pydantic models (constitution §4), never a raw dict.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class SourceOutcome(StrEnum):
    """The terminal outcome of scraping a single candidate URL via Jina Reader."""

    ok = "ok"
    paywalled = "paywalled"
    failed = "failed"


class Newsletter(BaseModel):
    """One unread newsletter fetched from Gmail, with the article URLs extracted from it."""

    model_config = ConfigDict(extra="forbid")

    sender: str
    subject: str
    received_at: datetime
    candidate_urls: list[str]


class ScrapedSource(BaseModel):
    """The result of scraping one candidate URL through Jina Reader.

    `markdown` and `title` are populated only when `outcome is SourceOutcome.ok`; a
    `paywalled` or `failed` source carries the outcome and no usable content.
    """

    model_config = ConfigDict(extra="forbid")

    url: str
    outcome: SourceOutcome
    title: str | None = None
    markdown: str | None = None


class SourceSet(BaseModel):
    """The full set of scraped sources for a run — the input to the validation gate (FR-4).

    `ok_count / total` and `ok_count` drive the ≥50%-AND-≥5 threshold; paywalled and failed
    sources count toward `total` but not toward `ok_count` (PRD §6, FR-A3).
    """

    model_config = ConfigDict(extra="forbid")

    sources: list[ScrapedSource]

    @property
    def total(self) -> int:
        return len(self.sources)

    @property
    def ok_sources(self) -> list[ScrapedSource]:
        return [s for s in self.sources if s.outcome is SourceOutcome.ok]

    @property
    def ok_count(self) -> int:
        return len(self.ok_sources)
