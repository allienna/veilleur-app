"""Slug derivation + Astro content serialization (T-1.4)."""

from __future__ import annotations

from minion import config
from minion.generate.models import ArticleFrontmatter, GeneratedArticle
from minion.publish.serialize import render_post, slugify


def test_slugify_basic() -> None:
    assert slugify("Hello, World!") == "hello-world"


def test_slugify_folds_accents() -> None:
    assert slugify("Le Veilleur déchaîné") == "le-veilleur-dechaine"


def test_slugify_collapses_punctuation_and_strips_edges() -> None:
    assert slugify("  --AI & Cloud: 2026 edition!--  ") == "ai-cloud-2026-edition"


def test_slugify_caps_length_without_trailing_hyphen() -> None:
    slug = slugify("word " * 40)  # far exceeds the cap
    assert len(slug) <= config.SLUG_MAX_LEN
    assert not slug.endswith("-")


def test_slugify_falls_back_when_empty() -> None:
    assert slugify("???") == "post"


def _article(**fm: object) -> GeneratedArticle:
    base: dict[str, object] = {
        "title": "T",
        "date": "2026-06-01",
        "description": "d",
        "tags": ["ai", "cloud"],
        "image": "2026-06-01.webp",
    }
    base.update(fm)
    return GeneratedArticle(
        theme="ai",
        frontmatter=ArticleFrontmatter.model_validate(base),
        body="The body.",
        linkedin="post",
        image_prompt="prompt",
    )


def test_render_post_structure_and_field_order() -> None:
    out = render_post(_article())
    assert out.startswith("---\n") and "\n---\n\n" in out
    assert out.endswith("The body.\n")
    body_start = out.index("\n---\n\n")
    fm_block = out[:body_start]
    # Fields appear in REQUIRED_FRONTMATTER_FIELDS + (image, kind) order.
    order = [line.split(":")[0] for line in fm_block.splitlines() if ":" in line and line != "---"]
    assert order == ["title", "date", "description", "tags", "image", "kind"]


def test_render_post_quotes_and_escapes_scalars() -> None:
    out = render_post(_article(title='A "quoted": colon'))
    assert 'title: "A \\"quoted\\": colon"' in out


def test_render_post_emits_tags_as_flow_sequence() -> None:
    out = render_post(_article())
    assert 'tags: ["ai", "cloud"]' in out
