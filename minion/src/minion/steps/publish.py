"""Real publishing steps (F-006): `imagen` (step 7), `github` (step 8), `publish` (step 9).

These replace the F-003 stub bodies for the final three pipeline slots. Data bag contract:
- `imagen`  -> reads `article`; writes `image` (ImageArtifact) + `article` with `frontmatter.image`
- `github`  -> reads `article` + `image`; persists the recoverable `ArticleDoc` (FR-6), commits md +
               image, writes `commit_sha` + `slug`
- `publish` -> reads `article` + `commit_sha`; upserts the final reader doc (`published=True`).
               Web push is deferred to F-012.

The Imagen moderation fallback (FR-2) is the sole producer of `success_with_warnings` (plan AD-4):
on a rejection the step rewrites the prompt once, then falls back to the bundled placeholder and
returns `StepResult(warning=...)` — never a hard fail (PRD §6 R2).
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from importlib.resources import files

from minion import config
from minion.generate.models import GeneratedArticle
from minion.models import StepName
from minion.publish.models import ArticleDoc, CommitResult, ImageArtifact
from minion.publish.ports import (
    ContentRepoError,
    ContentRepository,
    ImageGenerator,
    ImagenBlockedError,
    PromptRewriter,
)
from minion.publish.serialize import render_post, slugify
from minion.steps.base import StepContext, StepResult
from minion.store.ports import ArticleStore


def _require_article(ctx: StepContext) -> GeneratedArticle:
    article = ctx.data.get("article")
    if not isinstance(article, GeneratedArticle):
        raise RuntimeError("publish step missing a GeneratedArticle in the data bag")
    return article


def _load_placeholder() -> bytes:
    return (files("minion.publish.assets") / config.PLACEHOLDER_ASSET).read_bytes()


@dataclass
class ImagenStep:
    """Step 7: generate the hero image, with a rewrite-then-placeholder fallback (FR-1/FR-2)."""

    image_generator: ImageGenerator
    prompt_rewriter: PromptRewriter
    name: StepName = StepName.imagen

    def _generate_with_fallback(self, ctx: StepContext, base_prompt: str) -> tuple[bytes, bool]:
        """Return (webp_bytes, placeholder). Tries the base prompt, then up to `IMAGEN_RETRIES`
        softened rewrites, then the bundled placeholder (run downgraded to warnings)."""
        prompt = base_prompt
        try:
            return self.image_generator.generate(prompt), False
        except ImagenBlockedError as exc:
            reason = str(exc)
            ctx.log.warning("imagen rejected prompt", extra={"reason": reason})
        for attempt in range(config.IMAGEN_RETRIES):
            prompt = self.prompt_rewriter.soften(prompt, reason)
            try:
                image = self.image_generator.generate(prompt)
                ctx.log.info("imagen succeeded after rewrite", extra={"attempt": attempt + 1})
                return image, False
            except ImagenBlockedError as exc:
                reason = str(exc)
                ctx.log.warning("imagen rejected rewrite", extra={"attempt": attempt + 1})
        ctx.log.warning("imagen falling back to placeholder", extra={"reason": reason})
        return _load_placeholder(), True

    def run(self, ctx: StepContext) -> StepResult:
        article = _require_article(ctx)
        base_prompt = f"{article.image_prompt}\n\n{config.IMAGEN_BRAND_TEMPLATE}"
        webp, placeholder = self._generate_with_fallback(ctx, base_prompt)

        filename = f"{ctx.date}.webp"
        artifact = ImageArtifact(filename=filename, webp=webp, placeholder=placeholder)
        # Back-fill the hero filename so the committed markdown references the image (FR-1).
        updated = article.model_copy(
            update={"frontmatter": article.frontmatter.model_copy(update={"image": filename})}
        )
        ctx.log.info("hero image ready", extra={"placeholder": placeholder})
        return StepResult(
            payload={"image": artifact, "article": updated},
            warning=config.IMAGEN_FALLBACK_WARNING if placeholder else None,
        )


@dataclass
class GithubStep:
    """Step 8: persist the recoverable artefact, then commit md + image (FR-3/FR-4/FR-6)."""

    content_repo: ContentRepository
    article_store: ArticleStore
    sleep: Callable[[float], None] = time.sleep
    name: StepName = StepName.github

    def _commit_with_retry(self, path: str, content: bytes, message: str) -> str:
        """Commit one file with exponential-backoff retry (PRD §6); raise after exhausting."""
        for attempt in range(config.GITHUB_RETRIES + 1):
            try:
                return self.content_repo.put_file(path, content, message)
            except ContentRepoError:
                if attempt >= config.GITHUB_RETRIES:
                    raise
                self.sleep(config.GITHUB_BACKOFF_BASE.total_seconds() * (2**attempt))
        raise AssertionError("unreachable")  # pragma: no cover

    def run(self, ctx: StepContext) -> StepResult:
        article = _require_article(ctx)
        image = ctx.data.get("image")
        if not isinstance(image, ImageArtifact):
            raise RuntimeError("github step missing an ImageArtifact in the data bag")

        slug = slugify(article.frontmatter.title)
        # Persist the recoverable artefact BEFORE the failure-prone commit (FR-6 / plan AD-5):
        # a hard-failed push then still leaves a complete, replayable article in Firestore.
        recoverable = ArticleDoc(
            date=ctx.date,
            slug=slug,
            theme=article.theme,
            frontmatter=article.frontmatter,
            body=article.body,
            linkedin=article.linkedin,
            image=image.filename,
            commit_sha=None,
            published=False,
        )
        self.article_store.put_article(ctx.date, recoverable)

        md_path = config.POST_MD_PATH_TEMPLATE.format(date=ctx.date, slug=slug)
        image_path = config.POST_IMAGE_PATH_TEMPLATE.format(date=ctx.date)
        message = f"feat(veilleur): publish {ctx.date} article"
        md_sha = self._commit_with_retry(md_path, render_post(article).encode("utf-8"), message)
        image_sha = self._commit_with_retry(image_path, image.webp, message)

        ctx.log.info("article committed", extra={"slug": slug})
        return StepResult(
            payload={
                "commits": [
                    CommitResult(path=md_path, sha=md_sha),
                    CommitResult(path=image_path, sha=image_sha),
                ],
                "commit_sha": md_sha,
                "slug": slug,
            }
        )


@dataclass
class PublishStep:
    """Step 9: upsert the final reader doc (`published=True`); web push deferred to F-012 (FR-5)."""

    article_store: ArticleStore
    name: StepName = StepName.publish

    def run(self, ctx: StepContext) -> StepResult:
        article = _require_article(ctx)
        image = ctx.data.get("image")
        if not isinstance(image, ImageArtifact):
            raise RuntimeError("publish step missing an ImageArtifact in the data bag")
        slug = ctx.data.get("slug")
        if not isinstance(slug, str):
            slug = slugify(article.frontmatter.title)
        commit_sha = ctx.data.get("commit_sha")

        doc = ArticleDoc(
            date=ctx.date,
            slug=slug,
            theme=article.theme,
            frontmatter=article.frontmatter,
            body=article.body,
            linkedin=article.linkedin,
            image=image.filename,
            commit_sha=commit_sha if isinstance(commit_sha, str) else None,
            published=True,
        )
        self.article_store.put_article(ctx.date, doc)
        ctx.log.info("article persisted; web push deferred (F-012)")
        return StepResult()
