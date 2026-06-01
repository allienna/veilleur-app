"""Pure article-URL extraction from newsletter bodies (F-004 AD-8).

No I/O, no dependencies beyond the stdlib `html.parser` — easy to unit-test and to tune
during burn-in (F-013). The heuristic is deliberately conservative: collect every link, then
drop only the *clearly* non-article ones (management links, social-share buttons, asset/
tracking URLs, the sender's bare homepage), and deduplicate preserving first-seen order.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.parse import urlparse

# Substrings that mark list-management / subscription links rather than articles.
_NON_ARTICLE_SUBSTRINGS: tuple[str, ...] = (
    "unsubscribe",
    "list-manage",
    "optout",
    "opt-out",
    "/preferences",
    "email-preferences",
    "email-settings",
    "manage-subscription",
    "manage_subscription",
)

# Social / share hosts — newsletter share buttons, never the article itself.
_SOCIAL_HOSTS: frozenset[str] = frozenset(
    {
        "facebook.com",
        "www.facebook.com",
        "twitter.com",
        "www.twitter.com",
        "x.com",
        "www.x.com",
        "linkedin.com",
        "www.linkedin.com",
        "instagram.com",
        "www.instagram.com",
        "t.me",
        "wa.me",
    }
)

# Asset/tracking extensions — pixels, stylesheets, scripts.
_ASSET_SUFFIXES: tuple[str, ...] = (".gif", ".png", ".jpg", ".jpeg", ".svg", ".css", ".js")

_URL_RE = re.compile(r"https?://[^\s\"'<>)\]]+")


class _AnchorHrefParser(HTMLParser):
    """Collects the `href` of every `<a>` tag, in document order."""

    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        for name, value in attrs:
            if name == "href" and value:
                self.hrefs.append(value)


def _is_article_url(url: str, sender_domain: str | None) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    lowered = url.lower()
    if any(sub in lowered for sub in _NON_ARTICLE_SUBSTRINGS):
        return False
    if host in _SOCIAL_HOSTS:
        return False
    if path.endswith(_ASSET_SUFFIXES):
        return False
    # The sender's bare homepage ("visit our site" footer link) — but keep real article paths
    # on the sender's domain (e.g. a Substack post).
    if sender_domain and host.endswith(sender_domain.lower()) and path in ("", "/"):
        return False
    return True


def extract_article_urls(body: str, *, sender_domain: str | None = None) -> list[str]:
    """Extract candidate article URLs from a newsletter body (HTML or plain text).

    Collects `<a href>` links and bare `http(s)` URLs in the text, filters out clearly
    non-article links, and deduplicates preserving first-seen order.
    """
    parser = _AnchorHrefParser()
    parser.feed(body)
    candidates = [*parser.hrefs, *_URL_RE.findall(body)]

    seen: set[str] = set()
    result: list[str] = []
    for url in candidates:
        url = url.strip()
        if url in seen:
            continue
        if not _is_article_url(url, sender_domain):
            continue
        seen.add(url)
        result.append(url)
    return result
