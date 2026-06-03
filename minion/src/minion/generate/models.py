"""Minion-internal generation artefact models (F-005 AD-8).

These are *not* part of the PWA-facing shared schema; they are intermediate pipeline values
carried in the orchestrator data bag between the `assemble`, `generate`, and `validate_output`
steps. Every value crossing a step boundary is one of these Pydantic models (constitution §4).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ContextSource(BaseModel):
    """One scraped source as handed to `/generate` (the OK-source subset of a ScrapedSource)."""

    model_config = ConfigDict(extra="forbid")

    url: str
    title: str
    markdown: str


class AssembledContext(BaseModel):
    """The deterministic context bundle the `generate` step passes to `/generate` (FR-1)."""

    model_config = ConfigDict(extra="forbid")

    sources: list[ContextSource]


class ArticleFrontmatter(BaseModel):
    """Astro content-collection frontmatter for the generated article (fields per AD-5).

    Field set seeded from the external `allienna/veilleur` content schema; `image` is the hero
    filename the Imagen step (F-006) fills in and may be empty at generation time.
    """

    model_config = ConfigDict(extra="forbid")

    title: str
    date: str
    description: str
    tags: list[str]
    image: str = ""
    kind: str = "veille"


class GenerateInvocation(BaseModel):
    """One `/generate` CLI call's result: the artefact text plus usage telemetry (F-011 AD-5).

    `text` is the raw artefact the step parses into a `GeneratedArticle`. `cost_usd`/`tokens`
    come from `claude --output-format json` (`total_cost_usd` + `usage`); both are None when the
    CLI did not report them (older/plain output shape — the fallback path, F-011 plan AD-5).
    """

    model_config = ConfigDict(extra="forbid")

    text: str
    cost_usd: float | None = None
    tokens: int | None = None


class GeneratedArticle(BaseModel):
    """The artefact produced by one `/generate` call (theme + article + linkedin + image prompt)."""

    model_config = ConfigDict(extra="forbid")

    theme: str
    frontmatter: ArticleFrontmatter
    body: str
    linkedin: str
    image_prompt: str


class ValidationError(BaseModel):
    """A single deterministic validation failure (fed back into the retry loop, FR-6)."""

    model_config = ConfigDict(extra="forbid")

    code: str
    message: str


class ValidationReport(BaseModel):
    """The outcome of validating an article — the gate-of-record artefact (AD-3)."""

    model_config = ConfigDict(extra="forbid")

    errors: list[ValidationError]

    @property
    def ok(self) -> bool:
        return not self.errors
