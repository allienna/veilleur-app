"""Which sources does the published article actually cite?

Deterministic, no I/O — same spirit as `minion.generate.assemble`. Ficheing every ingested
source would multiply LLM calls by however many `assemble` retained (up to `MAX_GENERATE_
INPUT_TOKENS` worth), most of which a given article never ends up citing. Ficheing only the
cited ones bounds the cost and matches the legacy Astro schema's `used_in` semantics (a fiche
belongs to the article dates that actually referenced it).

"Cited" reuses the exact test `minion.generate.validate`'s `missing_attribution` check already
applies: `source.url` appears verbatim in the article body. Two independent parsers of the same
"## Sources" markdown heading would drift; one shared definition of citation can't.
"""

from __future__ import annotations

from minion.generate.models import ContextSource


def extract_cited_sources(article_body: str, sources: list[ContextSource]) -> list[ContextSource]:
    """Return the subset of `sources` whose URL appears in `article_body`, in `sources` order."""
    return [source for source in sources if source.url in article_body]
