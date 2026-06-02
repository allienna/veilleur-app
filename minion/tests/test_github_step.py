"""GithubStep: two-file commit, idempotent replay, retry-then-fail with persist-first (T-2.6)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pytest

from minion import config
from minion.clock import FrozenClock
from minion.config import PARIS_TZ
from minion.generate.models import ArticleFrontmatter, GeneratedArticle
from minion.logging import bind
from minion.publish.fakes import FakeContentRepository
from minion.publish.models import CommitResult, ImageArtifact
from minion.publish.ports import ContentRepoError
from minion.steps.base import StepContext
from minion.steps.publish import GithubStep
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


def _bag() -> dict[str, Any]:
    return {"article": _article(), "image": ImageArtifact(filename=f"{DATE}.webp", webp=b"IMG")}


def _step(repo: FakeContentRepository, store: InMemoryArticleStore) -> GithubStep:
    return GithubStep(content_repo=repo, article_store=store, sleep=lambda _s: None)


def test_commits_markdown_and_image_to_configured_paths() -> None:
    repo, store = FakeContentRepository(), InMemoryArticleStore()
    result = _step(repo, store).run(_ctx(**_bag()))

    paths = [c.path for c in repo.calls]
    assert paths == [
        f"site/src/content/posts/{DATE}-hello-world.md",
        f"site/public/images/posts/{DATE}.webp",
    ]
    commits = result.payload["commits"]
    assert isinstance(commits, list) and all(isinstance(c, CommitResult) for c in commits)
    assert result.payload["commit_sha"] == commits[0].sha  # the markdown commit SHA
    # The markdown body carries the serialized frontmatter + body.
    assert b'title: "Hello World"' in repo.calls[0].content


def test_persists_recoverable_article_before_commit() -> None:
    repo, store = FakeContentRepository(), InMemoryArticleStore()
    _step(repo, store).run(_ctx(**_bag()))
    doc = store.get_article(DATE)
    assert doc is not None and doc.published is False and doc.commit_sha is None
    assert doc.slug == "hello-world" and doc.image == f"{DATE}.webp"


def test_replay_overwrites_same_paths() -> None:
    repo, store = FakeContentRepository(), InMemoryArticleStore()
    step = _step(repo, store)
    step.run(_ctx(**_bag()))
    step.run(_ctx(**_bag()))  # replay
    # Same two paths committed again — idempotent by date (no new path variants).
    assert sorted({c.path for c in repo.calls}) == [
        f"site/public/images/posts/{DATE}.webp",
        f"site/src/content/posts/{DATE}-hello-world.md",
    ]


def test_retries_then_succeeds() -> None:
    repo = FakeContentRepository(fail_times=2)  # first two puts fail, third succeeds
    store = InMemoryArticleStore()
    result = _step(repo, store).run(_ctx(**_bag()))
    # md: calls 1,2 fail then 3 succeeds; image: call 4 succeeds.
    assert len(repo.calls) == 4
    assert result.payload["commit_sha"] == "sha-3"


def test_retries_exhausted_hard_fails_with_article_already_persisted() -> None:
    repo = FakeContentRepository(fail_times=99)  # always fail
    store = InMemoryArticleStore()
    with pytest.raises(ContentRepoError):
        _step(repo, store).run(_ctx(**_bag()))
    # md attempted GITHUB_RETRIES + 1 times, then raised.
    assert len(repo.calls) == config.GITHUB_RETRIES + 1
    # FR-6: the article is durable in Firestore despite the failed push.
    assert store.get_article(DATE) is not None
