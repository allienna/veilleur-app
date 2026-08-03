"""extract_cited_sources: which ingested sources does the published article actually cite?"""

from __future__ import annotations

from minion.fiches.extract import extract_cited_sources
from minion.generate.models import ContextSource


def _source(url: str, title: str = "t") -> ContextSource:
    return ContextSource(url=url, title=title, markdown="m")


def test_returns_only_sources_whose_url_appears_in_the_body() -> None:
    cited = _source("https://a.example/x", title="A")
    uncited = _source("https://b.example/y", title="B")
    body = f"Some prose citing [[1]]({cited.url}).\n\n## Sources\n\n1. [A]({cited.url})\n"
    assert extract_cited_sources(body, [cited, uncited]) == [cited]


def test_preserves_input_order_not_citation_order() -> None:
    first = _source("https://a.example/1")
    second = _source("https://a.example/2")
    # Cited in reverse order in the body; extraction still returns `sources` order.
    body = f"See {second.url} and also {first.url}."
    assert extract_cited_sources(body, [first, second]) == [first, second]


def test_empty_when_nothing_cited() -> None:
    sources = [_source("https://a.example/1"), _source("https://a.example/2")]
    assert extract_cited_sources("no links here at all", sources) == []


def test_empty_sources_list_returns_empty() -> None:
    assert extract_cited_sources("https://a.example/1 is cited", []) == []
