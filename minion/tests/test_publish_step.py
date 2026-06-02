"""PublishStep: idempotent reader-doc upsert with commit SHA + published flag (T-2.7)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from minion.clock import FrozenClock
from minion.config import PARIS_TZ
from minion.generate.models import ArticleFrontmatter, GeneratedArticle
from minion.logging import bind
from minion.publish.models import ImageArtifact
from minion.steps.base import StepContext
from minion.steps.publish import PublishStep
from minion.store.memory import InMemoryArticleStore

T0 = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)
DATE = "2026-06-01"


def _article() -> GeneratedArticle:
    return GeneratedArticle(
        theme="ai",
        frontmatter=ArticleFrontmatter(
            title="Hello World", date=DATE, description="d", tags=["ai"]
        ),
        body="body",
        linkedin="post",
        image_prompt="prompt",
    )


def _ctx(**data: Any) -> StepContext:
    return StepContext(run_id="R", date=DATE, clock=FrozenClock(T0), log=bind("R"), data=data)


def _bag(**extra: Any) -> dict[str, Any]:
    bag: dict[str, Any] = {
        "article": _article(),
        "image": ImageArtifact(filename=f"{DATE}.webp", webp=b"IMG"),
        "commit_sha": "sha-3",
        "slug": "hello-world",
    }
    bag.update(extra)
    return bag


def test_persists_published_article_with_commit_sha() -> None:
    store = InMemoryArticleStore()
    PublishStep(article_store=store).run(_ctx(**_bag()))
    doc = store.get_article(DATE)
    assert doc is not None
    assert doc.published is True
    assert doc.commit_sha == "sha-3"
    assert doc.slug == "hello-world" and doc.image == f"{DATE}.webp"
    assert doc.linkedin == "post" and doc.theme == "ai"


def test_upsert_is_idempotent_by_date() -> None:
    store = InMemoryArticleStore()
    step = PublishStep(article_store=store)
    step.run(_ctx(**_bag()))
    step.run(_ctx(**_bag()))
    # Still one article for the date (overwrite, not duplicate).
    assert store.get_article(DATE) is not None


def test_slug_recomputed_when_absent_from_bag() -> None:
    store = InMemoryArticleStore()
    bag = _bag()
    del bag["slug"]
    PublishStep(article_store=store).run(_ctx(**bag))
    doc = store.get_article(DATE)
    assert doc is not None and doc.slug == "hello-world"
