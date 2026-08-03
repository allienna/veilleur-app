"""F-006 end-to-end: full fake pipeline run (in CI) + gated real Vertex/GitHub smoke (T-3.4).

The fake e2e drives the whole ten-step pipeline through `run_pipeline` with every external
boundary faked, proving the first green "publishable article" path (AC-8): an `ArticleDoc` lands
in the article store, both files are committed, and the hero image bytes reach the GitHub layer.

The `integration` test is deselected by default (`addopts = -m 'not integration'`); run it with
`uv run pytest -m integration` on a host with ADC + the GitHub PAT secret.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import pytest

from minion.config import PARIS_TZ
from minion.fiches.fakes import FakeFicheGenerateRunner
from minion.generate.fakes import FakeGenerateRunner
from minion.ingest.fakes import FakeGmailClient, FakeScraperClient
from minion.ingest.models import Newsletter
from minion.models import RunStatus
from minion.orchestrator import run_pipeline
from minion.publish.fakes import FakeContentRepository, FakeImageGenerator, FakePromptRewriter
from minion.publish.ports import ImagenBlockedError
from minion.publish.serialize import slugify
from minion.steps import build_pipeline
from minion.store.memory import InMemoryArticleStore, InMemoryFicheStore

DATE = "2026-06-01"
T0 = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)
URLS = [f"https://x.com/{i}" for i in range(6)]  # ≥5 → passes validate_input


def _artifact(**overrides: Any) -> str:
    payload: dict[str, Any] = {
        "theme": "ai",
        "frontmatter": {
            "title": "Daily AI Watch",
            "date": "2026-06-01",
            "description": "d",
            "tags": ["ai"],
        },
        "body": "a clean synthesis body",
        "linkedin": "a post",
        "image_prompt": "a watchful owl",
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_full_fake_pipeline_publishes_article(run_store, lock_store, clock) -> None:
    article_store = InMemoryArticleStore()
    content_repo = FakeContentRepository()
    image_gen = FakeImageGenerator(outcomes=[b"HEROIMG"])
    gmail = FakeGmailClient(
        [Newsletter(sender="a@x.com", subject="s", received_at=T0, candidate_urls=URLS)]
    )
    steps = build_pipeline(
        gmail,
        FakeScraperClient(),
        FakeGenerateRunner(outputs=[_artifact()]),
        image_gen,
        FakePromptRewriter(),
        content_repo,
        article_store,
        FakeFicheGenerateRunner(),
        InMemoryFicheStore(),
    )

    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)

    assert final.status is RunStatus.success
    assert len(final.steps) == 10 and all(s.status is RunStatus.success for s in final.steps)

    # The published article is readable from the store (what F-009's PWA will render).
    doc = article_store.get_article(DATE)
    assert doc is not None
    assert doc.published is True and doc.commit_sha is not None
    assert doc.slug == "daily-ai-watch" and doc.image == f"{DATE}.webp"
    assert doc.frontmatter.image == f"{DATE}.webp"

    # Both files were committed; the hero image bytes (from the bag) reached the GitHub layer.
    committed = {c.path: c.content for c in content_repo.calls}
    assert f"site/src/content/posts/{DATE}-daily-ai-watch.md" in committed
    assert committed[f"site/public/images/posts/{DATE}.webp"] == b"HEROIMG"


def test_full_fake_pipeline_fiches_cited_sources_and_survives_a_failure(
    run_store, lock_store, clock
) -> None:
    # Distinct domains, not the shared module-level `URLS` (which are all `x.com/N`): the
    # copyright validator's `missing_attribution` check flags an ingested-but-uncited source as
    # unattributed once its *domain* appears anywhere in the prose — same-domain sources would
    # spuriously fail generate validation the moment any one of them gets cited.
    urls = [f"https://source{i}.example/a" for i in range(6)]
    article_store = InMemoryArticleStore()
    fiche_store = InMemoryFicheStore()
    gmail = FakeGmailClient(
        [Newsletter(sender="a@x.com", subject="s", received_at=T0, candidate_urls=urls)]
    )
    # `urls[0]`/`urls[1]` are cited; `urls[2:]` are ingested but never referenced, so only the
    # cited two should be ficheable — the whole point of the "only cited sources" scope decision.
    article_body = (
        "a clean synthesis body\n\n## Sources\n\n"
        f"1. [Title for {urls[0]}]({urls[0]})\n2. [Title for {urls[1]}]({urls[1]})\n"
    )
    fiche_body = (
        "## Résumé\nx\n\n## Points clés\n- a\n\n## Analyse approfondie\ny\n\n"
        "## Pourquoi ça compte\nz"
    )
    fiche_runner = FakeFicheGenerateRunner(
        outputs={urls[0]: json.dumps({"theme": "IA", "keywords": [], "body": fiche_body})},
        fail_urls=frozenset({urls[1]}),
    )
    steps = build_pipeline(
        gmail,
        FakeScraperClient(),
        FakeGenerateRunner(outputs=[_artifact(body=article_body)]),
        FakeImageGenerator(outcomes=[b"HEROIMG"]),
        FakePromptRewriter(),
        FakeContentRepository(),
        article_store,
        fiche_runner,
        fiche_store,
    )

    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)

    # The article publishes normally despite the fiche failure — fiches are never on its critical
    # path (plan AD, scope decision "non-blocking").
    assert final.status is RunStatus.success_with_warnings
    doc = article_store.get_article(DATE)
    assert doc is not None and doc.published is True

    # Only the two cited sources were ever invoked — the never-referenced urls[2:] were skipped.
    assert set(fiche_runner.calls) == {urls[0], urls[1]}
    succeeded = fiche_store.get_fiche(slugify(f"Title for {urls[0]}"))
    assert succeeded is not None
    assert succeeded.used_in == [DATE]
    assert fiche_store.get_fiche(slugify(f"Title for {urls[1]}")) is None  # scripted failure


def test_full_fake_pipeline_imagen_fallback_yields_warnings(run_store, lock_store, clock) -> None:
    article_store = InMemoryArticleStore()
    # Imagen always rejects → rewrite retry also rejects → placeholder fallback (warnings).
    image_gen = FakeImageGenerator(outcomes=[ImagenBlockedError("x"), ImagenBlockedError("y")])
    gmail = FakeGmailClient(
        [Newsletter(sender="a@x.com", subject="s", received_at=T0, candidate_urls=URLS)]
    )
    steps = build_pipeline(
        gmail,
        FakeScraperClient(),
        FakeGenerateRunner(outputs=[_artifact()]),
        image_gen,
        FakePromptRewriter(),
        FakeContentRepository(),
        article_store,
        FakeFicheGenerateRunner(),
        InMemoryFicheStore(),
    )

    final = run_pipeline(DATE, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps)
    assert final.status is RunStatus.success_with_warnings
    assert article_store.get_article(DATE) is not None  # article still published with placeholder


@pytest.mark.integration
def test_real_imagen_and_github_smoke() -> None:
    """Real Vertex Imagen generation + a GitHub commit round-trip (creds required)."""
    import shutil

    from minion import config
    from minion.publish.github import GitHubContentRepository
    from minion.publish.imagen import VertexImageGenerator
    from minion.secrets import MissingSecretError, require

    try:
        require(config.GITHUB_PAT_SECRET)
    except MissingSecretError:
        pytest.skip("GitHub PAT secret not provisioned")
    if shutil.which("gcloud") is None:
        pytest.skip("no GCP toolchain / ADC available")

    webp = VertexImageGenerator().generate(f"A simple test image. {config.IMAGEN_BRAND_TEMPLATE}")
    assert webp[:4] == b"RIFF"  # WebP container
    sha = GitHubContentRepository().put_file(
        "site/public/images/posts/_smoke.webp", webp, "chore(veilleur): imagen+github smoke"
    )
    assert isinstance(sha, str) and sha
