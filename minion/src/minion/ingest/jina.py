"""Production Jina Reader client (F-004 FR-3) — scrape candidate URLs to clean Markdown.

Each URL is GET-ed as `JINA_BASE_URL + url` (Jina Reader free tier, no API key — PRD §5).
Scraping runs under a bounded thread pool (`JINA_WORKERS`, AD-7) with per-URL retry/backoff
on 429 / transient errors and an overall deadline, so up to 100 URLs fit the ingestion budget
(PRD §4). A URL that exhausts its retries — or is left unfinished at the deadline — is reported
`failed`; a single bad source never raises (PRD §6 — the validation gate decides the run).
Paywalled content is flagged via configured output markers (FR-A3, AD-9).
"""

from __future__ import annotations

import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeout

import httpx

from minion.config import (
    JINA_BACKOFF_BASE,
    JINA_BASE_URL,
    JINA_DEADLINE,
    JINA_MAX_RETRIES,
    JINA_TIMEOUT,
    JINA_WORKERS,
    PAYWALL_MARKERS,
)
from minion.ingest.models import ScrapedSource, SourceOutcome

# Status codes worth retrying: rate-limit + transient server errors.
_RETRY_STATUS: frozenset[int] = frozenset({429, 500, 502, 503, 504})


def _extract_title(markdown: str) -> str | None:
    """Read Jina Reader's leading `Title:` header, if present."""
    for line in markdown.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("Title:"):
            return stripped[len("Title:") :].strip() or None
        return None  # first non-empty line wasn't a Title header
    return None


def _is_paywalled(text: str) -> bool:
    return any(marker in text for marker in PAYWALL_MARKERS)


class JinaReaderClient:
    """`JinaClient` implementation over Jina Reader via `httpx` + a bounded thread pool.

    `client` and `sleep` are injectable for tests (an `httpx.MockTransport`-backed client and
    a no-op sleep). The default client is built once and reused across the one-shot run.
    """

    def __init__(
        self,
        client: httpx.Client | None = None,
        *,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._client = client or httpx.Client(timeout=JINA_TIMEOUT.total_seconds())
        self._sleep = sleep

    def _try_once(self, target: str, url: str) -> ScrapedSource | None:
        """One scrape attempt. Returns a terminal `ScrapedSource`, or None to signal retry."""
        try:
            resp = self._client.get(target)
        except httpx.TransportError:
            return None  # transient → retryable
        if resp.status_code in _RETRY_STATUS:
            return None
        if not resp.is_success:
            return ScrapedSource(url=url, outcome=SourceOutcome.failed)  # non-retryable 4xx
        text = resp.text
        if _is_paywalled(text):
            return ScrapedSource(url=url, outcome=SourceOutcome.paywalled)
        return ScrapedSource(
            url=url, outcome=SourceOutcome.ok, title=_extract_title(text), markdown=text
        )

    def _scrape_one(self, url: str) -> ScrapedSource:
        target = JINA_BASE_URL + url
        for attempt in range(JINA_MAX_RETRIES + 1):
            result = self._try_once(target, url)
            if result is not None:
                return result
            if attempt < JINA_MAX_RETRIES:
                self._sleep(JINA_BACKOFF_BASE.total_seconds() * (2**attempt))
        return ScrapedSource(url=url, outcome=SourceOutcome.failed)  # retries exhausted

    def scrape(self, urls: list[str]) -> list[ScrapedSource]:
        if not urls:
            return []
        results: dict[str, ScrapedSource] = {}
        executor = ThreadPoolExecutor(max_workers=min(JINA_WORKERS, len(urls)))
        try:
            futures = {executor.submit(self._scrape_one, url): url for url in urls}
            try:
                for future in as_completed(futures, timeout=JINA_DEADLINE.total_seconds()):
                    results[futures[future]] = future.result()
            except FuturesTimeout:
                pass  # unfinished URLs fall through to `failed` below (deadline hit)
        finally:
            executor.shutdown(wait=False, cancel_futures=True)
        for url in urls:
            results.setdefault(url, ScrapedSource(url=url, outcome=SourceOutcome.failed))
        return [results[url] for url in urls]
