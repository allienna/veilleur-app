"""In-memory ArticleStore semantics: put→get and overwrite-by-date idempotency (T-1.5)."""

from __future__ import annotations

from minion.generate.models import ArticleFrontmatter
from minion.publish.models import ArticleDoc
from minion.store.memory import InMemoryArticleStore

DATE = "2026-06-01"


def _doc(**overrides: object) -> ArticleDoc:
    base: dict[str, object] = {
        "date": DATE,
        "slug": "a-post",
        "theme": "ai",
        "frontmatter": ArticleFrontmatter(title="T", date=DATE, description="d", tags=["ai"]),
        "body": "body",
        "linkedin": "post",
        "image": f"{DATE}.webp",
    }
    base.update(overrides)
    return ArticleDoc.model_validate(base)


def test_put_then_get_returns_article() -> None:
    store = InMemoryArticleStore()
    assert store.get_article(DATE) is None
    doc = _doc()
    store.put_article(DATE, doc)
    assert store.get_article(DATE) == doc


def test_put_overwrites_by_date() -> None:
    store = InMemoryArticleStore()
    store.put_article(DATE, _doc(published=False))
    store.put_article(DATE, _doc(published=True, commit_sha="abc123"))
    stored = store.get_article(DATE)
    assert stored is not None and stored.published is True and stored.commit_sha == "abc123"
