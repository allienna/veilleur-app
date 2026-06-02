"""Tests for the structural output validators (T-1.4, FR-4)."""

from __future__ import annotations

from typing import Any

from minion.generate.models import ArticleFrontmatter, GeneratedArticle
from minion.generate.validate import estimate_tokens, validate_structure


def _article(**overrides: Any) -> GeneratedArticle:
    fm_fields: dict[str, Any] = {
        "title": "A Title",
        "date": "2026-06-02",
        "description": "desc",
        "tags": ["ai"],
    }
    fm_fields.update(overrides.pop("frontmatter", {}))
    fm = ArticleFrontmatter(**fm_fields)
    base: dict[str, Any] = {
        "theme": "ai",
        "frontmatter": fm,
        "body": "word " * 100,
        "linkedin": "a LinkedIn post",
        "image_prompt": "a prompt",
    }
    base.update(overrides)
    return GeneratedArticle(**base)


def _codes(article: GeneratedArticle) -> set[str]:
    return {e.code for e in validate_structure(article)}


def test_valid_article_has_no_structural_errors() -> None:
    assert validate_structure(_article()) == []


def test_estimate_tokens_is_chars_over_four() -> None:
    assert estimate_tokens("") == 0
    assert estimate_tokens("a" * 8) == 2


def test_empty_required_frontmatter_field_flagged() -> None:
    assert "frontmatter_incomplete" in _codes(_article(frontmatter={"title": "   "}))


def test_empty_tags_flagged() -> None:
    assert "frontmatter_incomplete" in _codes(_article(frontmatter={"tags": []}))


def test_linkedin_over_limit_flagged() -> None:
    assert "linkedin_too_long" in _codes(_article(linkedin="x" * 3001))


def test_image_prompt_over_limit_flagged() -> None:
    assert "image_prompt_too_long" in _codes(_article(image_prompt="x" * 1001))


def test_article_over_word_limit_flagged() -> None:
    assert "article_too_long" in _codes(_article(body="word " * 10_001))
