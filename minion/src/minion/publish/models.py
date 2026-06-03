"""Minion-internal publishing artefacts (F-006 plan AD-2/AD-7).

These cross the `imagen` → `github` → `publish` step boundaries in the orchestrator data bag;
every value is an `extra="forbid"` Pydantic model so a malformed publish fails loudly
(constitution §4).

`ArticleDoc` is the persisted shape the PWA reads. As of F-009 (Q1) it is promoted to the
shared `article.json` schema (single source of truth, codegen → TS + Pydantic) and re-exported
here under its historical name so the publish/store call sites are unchanged. The nested
`Frontmatter` is the generated counterpart of `minion.generate.models.ArticleFrontmatter`;
the publish step maps between them at the construction boundary.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from veilleur_shared.article import Article as ArticleDoc
from veilleur_shared.article import Frontmatter

__all__ = ["ArticleDoc", "CommitResult", "Frontmatter", "ImageArtifact"]


class ImageArtifact(BaseModel):
    """The generated (or placeholder) hero image carried from `imagen` to `github`."""

    model_config = ConfigDict(extra="forbid")

    filename: str  # the date-stamped hero filename, e.g. "2026-06-01.webp"
    webp: bytes  # the WebP-encoded image bytes
    placeholder: bool = False  # True when the moderation fallback supplied a generic image


class CommitResult(BaseModel):
    """One committed file's path and resulting commit SHA (returned by `ContentRepository`)."""

    model_config = ConfigDict(extra="forbid")

    path: str
    sha: str
