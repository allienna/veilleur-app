"""Publish artefact models: round-trip and `extra="forbid"` enforcement (T-1.2)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from minion.generate.models import ArticleFrontmatter
from minion.publish.models import ArticleDoc, CommitResult, ImageArtifact


def _frontmatter() -> ArticleFrontmatter:
    return ArticleFrontmatter(title="T", date="2026-06-01", description="d", tags=["ai"])


def test_image_artifact_defaults_placeholder_false() -> None:
    art = ImageArtifact(filename="2026-06-01.webp", webp=b"RIFFxxxx")
    assert art.placeholder is False
    assert art.webp == b"RIFFxxxx"


def test_article_doc_round_trips() -> None:
    doc = ArticleDoc(
        date="2026-06-01",
        slug="a-post",
        theme="ai",
        frontmatter=_frontmatter(),
        body="body",
        linkedin="post",
        image="2026-06-01.webp",
    )
    assert ArticleDoc.model_validate(doc.model_dump()) == doc
    assert doc.commit_sha is None and doc.published is False


def test_commit_result_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        CommitResult.model_validate({"path": "p", "sha": "abc", "unexpected": 1})
