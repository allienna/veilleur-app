"""Fiche-internal generation artefact models.

Mirrors `minion.generate.models`: intermediate pipeline values carried between `extract_cited_
sources` and the `fiches` step, not part of the PWA-facing shared schema. The persisted shape
(`veilleur_shared.fiche.Fiche`) is assembled by the step from a `GeneratedFiche` plus the
`ContextSource` it was generated from — `url`/`title` come from the already-trusted source, not
from the LLM's echo of them, so a hallucinated URL can never reach Firestore.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from veilleur_shared.fiche import Fiche as FicheDoc

__all__ = ["FicheDoc", "FicheInvocation", "GeneratedFiche"]


class GeneratedFiche(BaseModel):
    """The artefact produced by one per-source fiche invocation."""

    model_config = ConfigDict(extra="forbid")

    theme: str
    keywords: list[str]
    tone: str | None = None
    body: str  # markdown: ## Résumé, ## Points clés, ## Analyse approfondie, ## Pourquoi ça compte


class FicheInvocation(BaseModel):
    """One fiche-generation call's result: the artefact text plus usage telemetry.

    Same shape as `minion.generate.models.GenerateInvocation` — `cost_usd`/`tokens` come from
    `claude --output-format json`; both None when the CLI didn't report them.
    """

    model_config = ConfigDict(extra="forbid")

    text: str
    cost_usd: float | None = None
    tokens: int | None = None
