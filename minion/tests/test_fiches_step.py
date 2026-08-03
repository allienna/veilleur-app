"""FichesStep: non-blocking per-source analysis, generated only for cited sources."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from minion.clock import FrozenClock
from minion.config import PARIS_TZ
from minion.fiches.fakes import FakeFicheGenerateRunner
from minion.generate.models import (
    ArticleFrontmatter,
    AssembledContext,
    ContextSource,
    GeneratedArticle,
)
from minion.logging import bind
from minion.steps.base import StepContext
from minion.steps.fiches import FICHE_PARTIAL_FAILURE_WARNING, FichesStep
from minion.store.memory import InMemoryFicheStore

T0 = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)
DATE = "2026-06-01"

SOURCE_A = ContextSource(url="https://a.example/1", title="Source A", markdown="content a")
SOURCE_B = ContextSource(url="https://b.example/2", title="Source B", markdown="content b")


def _fiche_json(theme: str = "IA", body: str | None = None) -> str:
    return json.dumps(
        {
            "theme": theme,
            "keywords": ["ia", "agents"],
            "tone": "opinion",
            "body": body
            or (
                "## Résumé\nUn résumé.\n\n"
                "## Points clés\n- un\n- deux\n\n"
                "## Analyse approfondie\nUne analyse.\n\n"
                "## Pourquoi ça compte\nParce que."
            ),
        }
    )


def _article(cites: list[ContextSource]) -> GeneratedArticle:
    citations = "\n".join(f"- [{s.title}]({s.url})" for s in cites)
    return GeneratedArticle(
        theme="ai",
        frontmatter=ArticleFrontmatter(title="T", date=DATE, description="d", tags=["ai"]),
        body=f"Corps de l'article.\n\n## Sources\n\n{citations}\n",
        linkedin="post",
        image_prompt="prompt",
    )


def _ctx(**data: Any) -> StepContext:
    return StepContext(run_id="R", date=DATE, clock=FrozenClock(T0), log=bind("R"), data=data)


def test_persists_one_fiche_per_cited_source() -> None:
    runner = FakeFicheGenerateRunner(
        outputs={SOURCE_A.url: _fiche_json(), SOURCE_B.url: _fiche_json()}
    )
    store = InMemoryFicheStore()
    result = FichesStep(runner=runner, fiche_store=store).run(
        _ctx(
            article=_article([SOURCE_A, SOURCE_B]),
            context=AssembledContext(sources=[SOURCE_A, SOURCE_B]),
        )
    )
    assert result.warning is None
    a = store.get_fiche("source-a")
    b = store.get_fiche("source-b")
    assert a is not None and a.url == SOURCE_A.url and a.used_in == [DATE]
    assert b is not None and b.theme == "IA"


def test_ignores_sources_not_cited_in_the_article() -> None:
    runner = FakeFicheGenerateRunner(outputs={SOURCE_A.url: _fiche_json()})
    store = InMemoryFicheStore()
    FichesStep(runner=runner, fiche_store=store).run(
        _ctx(
            article=_article([SOURCE_A]),  # only A cited
            context=AssembledContext(sources=[SOURCE_A, SOURCE_B]),
        )
    )
    assert runner.calls == [SOURCE_A.url]  # B never invoked
    assert store.get_fiche("source-b") is None


def test_no_cited_sources_is_a_clean_noop() -> None:
    runner = FakeFicheGenerateRunner()
    store = InMemoryFicheStore()
    result = FichesStep(runner=runner, fiche_store=store).run(
        _ctx(article=_article([]), context=AssembledContext(sources=[SOURCE_A]))
    )
    assert result.warning is None
    assert runner.calls == []


def test_one_failed_source_warns_but_does_not_block_the_others() -> None:
    runner = FakeFicheGenerateRunner(
        outputs={SOURCE_A.url: _fiche_json()}, fail_urls=frozenset({SOURCE_B.url})
    )
    store = InMemoryFicheStore()
    result = FichesStep(runner=runner, fiche_store=store).run(
        _ctx(
            article=_article([SOURCE_A, SOURCE_B]),
            context=AssembledContext(sources=[SOURCE_A, SOURCE_B]),
        )
    )
    assert result.warning == FICHE_PARTIAL_FAILURE_WARNING
    assert store.get_fiche("source-a") is not None
    assert store.get_fiche("source-b") is None


def test_invalid_fiche_body_is_skipped_with_a_warning() -> None:
    # Missing the required "## Pourquoi ça compte" section.
    bad_body = "## Résumé\nx\n\n## Points clés\n- a\n\n## Analyse approfondie\ny"
    runner = FakeFicheGenerateRunner(outputs={SOURCE_A.url: _fiche_json(body=bad_body)})
    store = InMemoryFicheStore()
    result = FichesStep(runner=runner, fiche_store=store).run(
        _ctx(article=_article([SOURCE_A]), context=AssembledContext(sources=[SOURCE_A]))
    )
    assert result.warning == FICHE_PARTIAL_FAILURE_WARNING
    assert store.get_fiche("source-a") is None


def test_used_in_accumulates_across_runs_on_the_same_source() -> None:
    runner = FakeFicheGenerateRunner(outputs={SOURCE_A.url: _fiche_json()})
    store = InMemoryFicheStore()
    step = FichesStep(runner=runner, fiche_store=store)
    step.run(_ctx(article=_article([SOURCE_A]), context=AssembledContext(sources=[SOURCE_A])))
    later_ctx = StepContext(
        run_id="R2",
        date="2026-06-15",
        clock=FrozenClock(T0),
        log=bind("R2"),
        data={"article": _article([SOURCE_A]), "context": AssembledContext(sources=[SOURCE_A])},
    )
    step.run(later_ctx)
    fiche = store.get_fiche("source-a")
    assert fiche is not None
    assert fiche.used_in == [DATE, "2026-06-15"]
