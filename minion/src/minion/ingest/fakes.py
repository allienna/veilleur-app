"""Hermetic test doubles for the ingestion ports (F-004 AD-1).

Mirrors `store/memory.py`: in-memory fakes that satisfy the `GmailClient` / `ScraperClient`
Protocols so steps and the full pipeline can be exercised without network access.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from minion.ingest.models import Newsletter, ScrapedSource, SourceOutcome


def _no_newsletters() -> list[Newsletter]:
    return []


def _no_results() -> dict[str, ScrapedSource]:
    return {}


@dataclass
class FakeGmailClient:
    """Returns canned newsletters, or raises `error` to simulate an auth/refresh failure."""

    newsletters: list[Newsletter] = field(default_factory=_no_newsletters)
    error: Exception | None = None

    def fetch_unread(self, date: str) -> list[Newsletter]:
        if self.error is not None:
            raise self.error
        return list(self.newsletters)


def _default_source(url: str) -> ScrapedSource:
    return ScrapedSource(
        url=url, outcome=SourceOutcome.ok, title=f"Title for {url}", markdown=f"# {url}\n\nbody"
    )


@dataclass
class FakeScraperClient:
    """Returns canned scrape results.

    `results` maps a URL to its `ScrapedSource`; any URL not present gets a default `ok`
    source. Set entries with `paywalled` / `failed` outcomes to exercise the gate.
    """

    results: dict[str, ScrapedSource] = field(default_factory=_no_results)

    def scrape(self, urls: list[str]) -> list[ScrapedSource]:
        return [self.results.get(url) or _default_source(url) for url in urls]
