"""ImagenStep: happy generation, rewrite retry, placeholder fallback + warning (T-2.4/T-2.5)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from minion import config
from minion.clock import FrozenClock
from minion.config import PARIS_TZ
from minion.generate.models import ArticleFrontmatter, GeneratedArticle
from minion.logging import bind
from minion.publish.fakes import FakeImageGenerator, FakePromptRewriter
from minion.publish.models import ImageArtifact
from minion.publish.ports import ImagenBlockedError
from minion.steps.base import StepContext
from minion.steps.publish import ImagenStep

T0 = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)
DATE = "2026-06-01"


def _article() -> GeneratedArticle:
    return GeneratedArticle(
        theme="ai",
        frontmatter=ArticleFrontmatter(title="T", date=DATE, description="d", tags=["ai"]),
        body="body",
        linkedin="post",
        image_prompt="a watchful owl over a city",
    )


def _ctx(**data: Any) -> StepContext:
    return StepContext(run_id="R", date=DATE, clock=FrozenClock(T0), log=bind("R"), data=data)


def _step(gen: FakeImageGenerator, rewriter: FakePromptRewriter) -> ImagenStep:
    return ImagenStep(image_generator=gen, prompt_rewriter=rewriter)


def test_happy_generation_writes_artifact_and_backfills_image() -> None:
    gen = FakeImageGenerator(outcomes=[b"WEBPDATA"])
    rewriter = FakePromptRewriter()
    result = _step(gen, rewriter).run(_ctx(article=_article()))

    image = result.payload["image"]
    assert isinstance(image, ImageArtifact)
    assert image.filename == f"{DATE}.webp" and image.webp == b"WEBPDATA"
    assert image.placeholder is False
    assert result.warning is None
    # The brand template is appended to the article's image_prompt.
    assert config.IMAGEN_BRAND_TEMPLATE in gen.prompts[0]
    assert "watchful owl" in gen.prompts[0]
    # frontmatter.image is back-filled on the article passed downstream.
    assert result.payload["article"].frontmatter.image == f"{DATE}.webp"  # type: ignore[union-attr]
    assert rewriter.calls == []  # no rewrite on the happy path


def test_rejection_then_rewrite_succeeds() -> None:
    gen = FakeImageGenerator(outcomes=[ImagenBlockedError("blocked"), b"WEBP2"])
    rewriter = FakePromptRewriter()
    result = _step(gen, rewriter).run(_ctx(article=_article()))

    image = result.payload["image"]
    assert isinstance(image, ImageArtifact) and image.webp == b"WEBP2"
    assert image.placeholder is False
    assert result.warning is None
    assert len(rewriter.calls) == 1  # one softening retry
    assert gen.prompts[1].startswith("softened: ")  # the rewritten prompt was used


def test_rejection_exhausted_falls_back_to_placeholder_with_warning() -> None:
    gen = FakeImageGenerator(
        outcomes=[ImagenBlockedError("blocked"), ImagenBlockedError("still blocked")]
    )
    rewriter = FakePromptRewriter()
    result = _step(gen, rewriter).run(_ctx(article=_article()))

    image = result.payload["image"]
    assert isinstance(image, ImageArtifact)
    assert image.placeholder is True
    assert image.webp[:4] == b"RIFF"  # the bundled WebP asset loaded
    assert len(image.webp) > 0
    assert result.warning == config.IMAGEN_FALLBACK_WARNING
    assert len(rewriter.calls) == config.IMAGEN_RETRIES
