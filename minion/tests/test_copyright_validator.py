"""Tests for the copyright post-validator (T-1.5, FR-5 / constitution §4)."""

from __future__ import annotations

from typing import Any

from minion.generate.models import ArticleFrontmatter, ContextSource, GeneratedArticle
from minion.generate.validate import validate_article, validate_copyright

SOURCE_BODY = (
    "Kubernetes introduced sidecar containers as a first class feature in version one twenty "
    "eight which changes how init containers are scheduled and managed across the cluster fleet."
)
SOURCE = ContextSource(
    url="https://thenewstack.io/k8s-sidecars", title="K8s Sidecars", markdown=SOURCE_BODY
)


def _article(body: str, **overrides: Any) -> GeneratedArticle:
    fm = ArticleFrontmatter(title="T", date="2026-06-02", description="d", tags=["cloud"])
    base: dict[str, Any] = {
        "theme": "cloud",
        "frontmatter": fm,
        "body": body,
        "linkedin": "post",
        "image_prompt": "prompt",
    }
    base.update(overrides)
    return GeneratedArticle(**base)


def _codes(body: str) -> set[str]:
    return {e.code for e in validate_copyright(_article(body), [SOURCE])}


def test_clean_synthesis_passes() -> None:
    body = (
        "A new scheduling model for sidecars landed recently. See the writeup at "
        "https://thenewstack.io/k8s-sidecars for the details from K8s Sidecars."
    )
    assert validate_copyright(_article(body), [SOURCE]) == []


def test_quote_over_thirty_words_flagged() -> None:
    long_quote = " ".join(f"w{i}" for i in range(31))
    assert "quote_too_long" in _codes(f"He said «{long_quote}».")


def test_more_than_one_quote_per_source_flagged() -> None:
    body = (
        "It noted «Kubernetes introduced sidecar containers» early on, "
        "and later «changes how init containers are scheduled» as well."
    )
    assert "too_many_quotes" in _codes(body)


def test_wholesale_reproduction_flagged() -> None:
    # Copies a long verbatim run from the source, unquoted.
    assert "wholesale_reproduction" in _codes(SOURCE_BODY)


def test_short_attributed_quote_not_flagged_as_wholesale() -> None:
    # A ≤30-word quoted span shares tokens with the source but must NOT trip wholesale.
    body = (
        "The piece observed that «Kubernetes introduced sidecar containers as a first class "
        "feature» — see https://thenewstack.io/k8s-sidecars (K8s Sidecars)."
    )
    codes = _codes(body)
    assert "wholesale_reproduction" not in codes
    assert "quote_too_long" not in codes


def test_referenced_source_without_link_flagged() -> None:
    body = "As K8s Sidecars reported, the scheduling model changed this year."
    assert "missing_attribution" in _codes(body)


def test_validate_article_combines_structural_and_copyright() -> None:
    report = validate_article(_article("a clean body", linkedin="x" * 3001), [SOURCE])
    codes = {e.code for e in report.errors}
    assert "linkedin_too_long" in codes
    assert report.ok is False
