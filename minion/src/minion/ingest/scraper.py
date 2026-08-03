# pyright: basic
# ^ trafilatura ships no type stubs (see pyproject reportMissingTypeStubs); this SDK-boundary
#   client is dropped to basic checking, matching secrets.py / store/firestore.py.
"""Production scrape client (F-015) — fetch candidate URLs and extract clean Markdown locally.

Replaces the rate-limited Jina Reader (PRD §5 amendment). Each URL is fetched directly from its
origin with `httpx` (browser-like UA + redirects) and its main content is extracted in-process by
`trafilatura` — no external scraping service, key, or rate limit. Scraping runs under a bounded
thread pool (`SCRAPE_WORKERS`) with per-URL retry/backoff on transient errors and an overall
deadline, so up to 100 URLs fit the ingestion budget (PRD §4). A URL that exhausts its retries —
or is left unfinished at the deadline — is reported `failed`; a single bad source never raises
(PRD §6 — the validation gate decides the run). Paywalled content is flagged via configured
markers matched on the raw HTML (FR-3).
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeout
from urllib.parse import urlparse

import httpx
import trafilatura

from minion.config import (
    PAYWALL_MARKERS,
    SCRAPE_BACKOFF_BASE,
    SCRAPE_DEADLINE,
    SCRAPE_HOST_MIN_INTERVAL,
    SCRAPE_MAX_RETRIES,
    SCRAPE_TIMEOUT,
    SCRAPE_USER_AGENT,
    SCRAPE_WORKERS,
)
from minion.ingest.models import ScrapedSource, SourceOutcome

# Status codes worth retrying: rate-limit (rare from origins now) + transient server errors.
_RETRY_STATUS: frozenset[int] = frozenset({429, 500, 502, 503, 504})


def _extract_markdown(html: str) -> str | None:
    """Main content as Markdown, or None when there's nothing usable (JS-only shells, non-article
    pages, parse failures). `favor_precision` keeps boilerplate out of the synthesis input."""
    return trafilatura.extract(html, output_format="markdown", favor_precision=True)


def _extract_title(html: str) -> str | None:
    meta = trafilatura.extract_metadata(html)
    return getattr(meta, "title", None) if meta is not None else None


def _is_paywalled(html: str) -> bool:
    return any(marker in html for marker in PAYWALL_MARKERS)


def _looks_like_html(resp: httpx.Response) -> bool:
    return "html" in resp.headers.get("content-type", "").lower()


class LocalExtractorClient:
    """`ScraperClient` implementation: direct-origin `httpx` fetch + `trafilatura` extraction.

    `client` and `sleep` are injectable for tests (an `httpx.MockTransport`-backed client and a
    no-op sleep). The default client is built once and reused across the one-shot run, with a
    browser-like User-Agent and redirect-following so publishers don't 403 a bare client.
    """

    def __init__(
        self,
        client: httpx.Client | None = None,
        *,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._client = client or httpx.Client(
            timeout=SCRAPE_TIMEOUT.total_seconds(),
            follow_redirects=True,
            headers={"User-Agent": SCRAPE_USER_AGENT},
        )
        self._sleep = sleep
        self._host_lock = threading.Lock()
        self._host_next_ok: dict[str, float] = {}

    def _throttle_host(self, url: str) -> None:
        """Enforce a minimum gap between requests to the same host across all workers.

        `SCRAPE_WORKERS` only bounds *global* concurrency — many URLs landing on one host (a
        newsletter linking dozens of posts on the same domain, or a tracking-redirect host like
        Beehiiv's `link.mail.beehiiv.com`) still get hit by several workers at once, which looks
        like abuse to that host's own rate limiter (429/403), not to us.
        """
        host = urlparse(url).netloc.lower()
        with self._host_lock:
            now = time.monotonic()
            wait = self._host_next_ok.get(host, now) - now
            self._host_next_ok[host] = max(now, self._host_next_ok.get(host, now)) + (
                SCRAPE_HOST_MIN_INTERVAL.total_seconds()
            )
        if wait > 0:
            self._sleep(wait)

    def _try_once(self, url: str) -> ScrapedSource | None:
        """One fetch+extract attempt. Returns a terminal `ScrapedSource`, or None to retry."""
        self._throttle_host(url)
        try:
            resp = self._client.get(url)
        except httpx.TransportError:
            return None  # transient → retryable
        if resp.status_code in _RETRY_STATUS:
            return None
        if not resp.is_success or not _looks_like_html(resp):
            return ScrapedSource(url=url, outcome=SourceOutcome.failed)
        html = resp.text
        if _is_paywalled(html):
            return ScrapedSource(url=url, outcome=SourceOutcome.paywalled)
        markdown = _extract_markdown(html)
        if not markdown:
            return ScrapedSource(url=url, outcome=SourceOutcome.failed)  # nothing extractable
        return ScrapedSource(
            url=url, outcome=SourceOutcome.ok, title=_extract_title(html), markdown=markdown
        )

    def _scrape_one(self, url: str) -> ScrapedSource:
        for attempt in range(SCRAPE_MAX_RETRIES + 1):
            result = self._try_once(url)
            if result is not None:
                return result
            if attempt < SCRAPE_MAX_RETRIES:
                self._sleep(SCRAPE_BACKOFF_BASE.total_seconds() * (2**attempt))
        return ScrapedSource(url=url, outcome=SourceOutcome.failed)  # retries exhausted

    def scrape(self, urls: list[str]) -> list[ScrapedSource]:
        if not urls:
            return []
        results: dict[str, ScrapedSource] = {}
        executor = ThreadPoolExecutor(max_workers=min(SCRAPE_WORKERS, len(urls)))
        try:
            futures = {executor.submit(self._scrape_one, url): url for url in urls}
            try:
                for future in as_completed(futures, timeout=SCRAPE_DEADLINE.total_seconds()):
                    results[futures[future]] = future.result()
            except FuturesTimeout:
                pass  # unfinished URLs fall through to `failed` below (deadline hit)
        finally:
            executor.shutdown(wait=False, cancel_futures=True)
        for url in urls:
            results.setdefault(url, ScrapedSource(url=url, outcome=SourceOutcome.failed))
        return [results[url] for url in urls]
