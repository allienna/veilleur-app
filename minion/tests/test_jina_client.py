"""Tests for the real Jina client over httpx.MockTransport (T-2.2).

These also pin the paywall marker (AD-9): the fixture returns Jina output containing a
`PAYWALL_MARKERS` substring and asserts the source is flagged `paywalled`.
"""

from __future__ import annotations

import httpx

from minion.ingest.jina import JinaReaderClient
from minion.ingest.models import SourceOutcome


def _make_client(handler) -> JinaReaderClient:  # type: ignore[no-untyped-def]
    transport = httpx.MockTransport(handler)
    return JinaReaderClient(client=httpx.Client(transport=transport), sleep=lambda _s: None)


def test_success_returns_ok_with_title_and_markdown() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="Title: Hello World\n\nthe body text")

    [src] = _make_client(handler).scrape(["https://example.com/a"])
    assert src.outcome is SourceOutcome.ok
    assert src.title == "Hello World"
    assert src.markdown is not None and "the body text" in src.markdown


def test_429_then_success_is_retried() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429)
        return httpx.Response(200, text="Title: T\n\nok")

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


def test_paywall_marker_flags_paywalled() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = "Title: Members only\n\nThis content is for subscribers only"
        return httpx.Response(200, text=body)

    [src] = _make_client(handler).scrape(["https://example.com/e"])
    assert src.outcome is SourceOutcome.paywalled


def test_targets_jina_reader_prefix() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(200, text="x")

    _make_client(handler).scrape(["https://example.com/p"])
    assert seen["url"].startswith("https://r.jina.ai/")
    assert "example.com/p" in seen["url"]


def test_preserves_input_order() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="ok")

    urls = [f"https://x.com/{i}" for i in range(10)]
    srcs = _make_client(handler).scrape(urls)
    assert [s.url for s in srcs] == urls


def test_empty_urls_returns_empty() -> None:
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - never called
        return httpx.Response(200)

    assert _make_client(handler).scrape([]) == []
