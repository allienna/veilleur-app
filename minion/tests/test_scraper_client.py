"""Tests for the local extraction client (F-015) over httpx.MockTransport.

The fetch layer is mocked (MockTransport + no-op sleep); trafilatura runs for real on the canned
HTML below — extraction is deterministic on static input. Also pins paywall detection (FR-3): a
raw-HTML `PAYWALL_MARKERS` substring flags the source `paywalled`.
"""

from __future__ import annotations

import httpx

from minion.ingest.models import SourceOutcome
from minion.ingest.scraper import LocalExtractorClient

# A real-ish article: trafilatura extracts a title + a couple of body paragraphs from this.
_ARTICLE_HTML = """<html><head><title>Hello World</title></head>
<body><article><h1>Hello World</h1>
<p>This is the main body paragraph with enough words to be extracted by trafilatura cleanly.</p>
<p>A second paragraph here for good measure and sufficient length to pass precision filtering.</p>
</article></body></html>"""

# JS-only shell — no extractable main content (trafilatura returns None).
_JS_SHELL_HTML = "<html><body><div id='app'></div></body></html>"

# Paywalled — raw HTML carries the schema.org JSON-LD signal.
_PAYWALL_HTML = (
    '<html><head><script type="application/ld+json">'
    '{"@type":"NewsArticle","isAccessibleForFree":false}</script></head>'
    "<body><article><p>Teaser only.</p></article></body></html>"
)

_HTML_HEADERS = {"content-type": "text/html; charset=utf-8"}


def _make_client(handler) -> LocalExtractorClient:  # type: ignore[no-untyped-def]
    transport = httpx.MockTransport(handler)
    return LocalExtractorClient(client=httpx.Client(transport=transport), sleep=lambda _s: None)


def test_success_returns_ok_with_title_and_markdown() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=_ARTICLE_HTML, headers=_HTML_HEADERS)

    [src] = _make_client(handler).scrape(["https://example.com/a"])
    assert src.outcome is SourceOutcome.ok
    assert src.title == "Hello World"
    assert src.markdown is not None and "main body paragraph" in src.markdown


def test_fetches_origin_url_directly() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(200, text=_ARTICLE_HTML, headers=_HTML_HEADERS)

    _make_client(handler).scrape(["https://example.com/p"])
    assert seen["url"] == "https://example.com/p"  # no reader prefix, fetched directly


def test_paywall_marker_flags_paywalled() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=_PAYWALL_HTML, headers=_HTML_HEADERS)

    [src] = _make_client(handler).scrape(["https://example.com/wall"])
    assert src.outcome is SourceOutcome.paywalled


def test_empty_extraction_marks_failed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=_JS_SHELL_HTML, headers=_HTML_HEADERS)

    [src] = _make_client(handler).scrape(["https://example.com/spa"])
    assert src.outcome is SourceOutcome.failed


def test_non_html_content_type_marks_failed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="{}", headers={"content-type": "application/json"})

    [src] = _make_client(handler).scrape(["https://example.com/api"])
    assert src.outcome is SourceOutcome.failed


def test_429_then_success_is_retried() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429)
        return httpx.Response(200, text=_ARTICLE_HTML, headers=_HTML_HEADERS)

    [src] = _make_client(handler).scrape(["https://example.com/b"])
    assert src.outcome is SourceOutcome.ok
    assert calls["n"] == 2  # one retry after the 429


def test_persistent_5xx_marks_failed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    [src] = _make_client(handler).scrape(["https://example.com/c"])
    assert src.outcome is SourceOutcome.failed


def test_non_retryable_4xx_marks_failed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    [src] = _make_client(handler).scrape(["https://example.com/d"])
    assert src.outcome is SourceOutcome.failed


def test_transport_error_is_retried_then_failed() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        raise httpx.ConnectError("boom")

    [src] = _make_client(handler).scrape(["https://example.com/e"])
    assert src.outcome is SourceOutcome.failed
    assert calls["n"] == 3  # initial + SCRAPE_MAX_RETRIES (2)


def test_preserves_input_order() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=_ARTICLE_HTML, headers=_HTML_HEADERS)

    urls = [f"https://x.com/{i}" for i in range(10)]
    srcs = _make_client(handler).scrape(urls)
    assert [s.url for s in srcs] == urls


def test_empty_urls_returns_empty() -> None:
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - never called
        return httpx.Response(200)

    assert _make_client(handler).scrape([]) == []


def test_throttles_concurrent_requests_to_same_host() -> None:
    # 2026-08-02 burn-in: a newsletter linking dozens of posts on one host (or a tracking-redirect
    # domain like Beehiiv's) got hit by several workers at once and was rate-limited (429/403) by
    # the host itself. Same-host requests must be spaced out even under concurrency.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=_ARTICLE_HTML, headers=_HTML_HEADERS)

    waits: list[float] = []
    client = LocalExtractorClient(
        client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=waits.append
    )
    client.scrape(["https://example.com/a", "https://example.com/b"])
    assert any(w > 0 for w in waits)


def test_does_not_throttle_across_different_hosts() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=_ARTICLE_HTML, headers=_HTML_HEADERS)

    waits: list[float] = []
    client = LocalExtractorClient(
        client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=waits.append
    )
    client.scrape(["https://a.example.com/x", "https://b.example.com/y"])
    assert waits == []
