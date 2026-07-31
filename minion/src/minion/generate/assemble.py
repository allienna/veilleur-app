"""Deterministic context assembly for `/generate` (F-005 FR-1, AD-10).

Turns the validated `SourceSet` (F-004) into the `AssembledContext` the agent consumes: only
`ok` sources, in source order, trimmed so the estimated token count fits the 500k input budget.
Truncation drops the lowest-priority (trailing) sources and is logged — never silent.
"""

from __future__ import annotations

from minion import config
from minion.generate.models import AssembledContext, ContextSource
from minion.generate.validate import estimate_tokens
from minion.ingest.models import SourceSet
from minion.logging import BoundLogger


def assemble_context(source_set: SourceSet, *, log: BoundLogger) -> AssembledContext:
    """Select OK sources in order, dropping trailing ones until within the input-token budget.

    Sources are also deduped by title (first-seen kept): the same article is sometimes syndicated
    across multiple newsletter editions with distinct tracking-wrapper URLs (e.g. TLDR Dev and
    TLDR AI both linking the same post). Left undeduped, the model cites one URL while the article
    prose still names the shared title, which makes the copyright validator's title-attribution
    check flag the other, uncited duplicate as "referenced but not linked" (2026-07-31 burn-in).
    """
    selected: list[ContextSource] = []
    seen_titles: set[str] = set()
    used_tokens = 0
    dropped = 0

    for source in source_set.ok_sources:
        title_key = (source.title or "").strip().lower()
        if title_key and title_key in seen_titles:
            continue
        markdown = source.markdown or ""
        cost = (
            estimate_tokens(markdown)
            + estimate_tokens(source.url)
            + estimate_tokens(source.title or "")
        )
        if used_tokens + cost > config.MAX_GENERATE_INPUT_TOKENS:
            dropped = source_set.ok_count - len(selected)
            break
        selected.append(ContextSource(url=source.url, title=source.title or "", markdown=markdown))
        used_tokens += cost
        if title_key:
            seen_titles.add(title_key)

    if dropped:
        log.info(
            "context truncated to fit input budget",
            extra={"kept": len(selected), "dropped": dropped, "est_tokens": used_tokens},
        )

    return AssembledContext(sources=selected)
