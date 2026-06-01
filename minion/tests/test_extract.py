"""Tests for the pure article-URL extraction heuristic (T-1.6, AD-8)."""

from __future__ import annotations

from minion.ingest.extract import extract_article_urls


def test_extracts_anchor_hrefs_in_order() -> None:
    body = '<a href="https://example.com/post-a">A</a><a href="https://example.com/post-b">B</a>'
    assert extract_article_urls(body) == [
        "https://example.com/post-a",
        "https://example.com/post-b",
    ]


def test_extracts_bare_urls_from_plain_text() -> None:
    body = "Read https://blog.dev/x and https://blog.dev/y today."
    assert extract_article_urls(body) == ["https://blog.dev/x", "https://blog.dev/y"]


def test_drops_management_and_mailto_links() -> None:
    body = (
        '<a href="https://news.co/article">Read</a>'
        '<a href="https://news.co/unsubscribe?u=1">Unsubscribe</a>'
        '<a href="https://news.co/email-preferences">Preferences</a>'
        '<a href="mailto:hi@news.co">Email us</a>'
    )
    assert extract_article_urls(body) == ["https://news.co/article"]


def test_drops_social_share_and_asset_links() -> None:
    body = (
        '<a href="https://example.com/real">Real</a>'
        '<a href="https://twitter.com/intent/tweet?url=x">Tweet</a>'
        '<a href="https://cdn.example.com/pixel.gif">px</a>'
    )
    assert extract_article_urls(body) == ["https://example.com/real"]


def test_drops_sender_bare_homepage_but_keeps_article_path() -> None:
    body = (
        '<a href="https://sub.substack.com/">Home</a>'
        '<a href="https://sub.substack.com/p/the-post">Post</a>'
    )
    assert extract_article_urls(body, sender_domain="sub.substack.com") == [
        "https://sub.substack.com/p/the-post"
    ]


def test_deduplicates_preserving_order() -> None:
    body = (
        '<a href="https://a.io/x">1</a><a href="https://a.io/x">2</a><a href="https://a.io/y">3</a>'
    )
    assert extract_article_urls(body) == ["https://a.io/x", "https://a.io/y"]


def test_empty_body_returns_empty() -> None:
    assert extract_article_urls("") == []
