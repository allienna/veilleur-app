"""Minion-internal publishing artefacts (F-006 plan AD-2/AD-7).

These cross the `imagen` → `github` → `publish` step boundaries in the orchestrator data bag;
every value is an `extra="forbid"` Pydantic model so a malformed publish fails loudly
(constitution §4). `ArticleDoc` is the persisted shape the PWA reads (F-009); it is kept
Minion-internal until F-009 consumes it, when it may be promoted to a shared `article.json`.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from minion.generate.models import ArticleFrontmatter


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


class ArticleDoc(BaseModel):
    """The published article persisted to `articles/{date}` for the PWA to read (FR-5)."""

    model_config = ConfigDict(extra="forbid")

    date: str
    slug: str
    theme: str
    frontmatter: ArticleFrontmatter
    body: str
    linkedin: str
    image: str  # hero image filename (mirrors frontmatter.image)
    commit_sha: str | None = None  # set by `publish` once the GitHub commit lands
    published: bool = False  # False = recoverable pre-commit persist; True = live on the site
