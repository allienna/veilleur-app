"""The ordered pipeline-step registry.

`STEPS` is the canonical all-stub sequence (F-003), kept as the orchestrator's default so the
lifecycle tests have a generic nine-step pipeline. `build_pipeline` assembles the *real*
pipeline: ingestion (`gmail` / `jina` / `validate_input`, F-004), generation (`assemble` /
`generate` / `validate_output`, F-005), and publishing (`imagen` / `github` / `publish`, F-006)
steps wired to their injected clients/stores — every slot is now real (only the web-push half of
`publish` remains internally deferred to F-012). Either way the ordering is fixed by `STEP_ORDER`.
"""

from __future__ import annotations

from minion.config import STEP_ORDER
from minion.generate.ports import GenerateRunner
from minion.ingest.ports import GmailClient, JinaClient
from minion.models import StepName
from minion.publish.ports import ContentRepository, ImageGenerator, PromptRewriter
from minion.steps.base import Step, StepContext, StepResult
from minion.steps.generation import AssembleStep, GenerateStep, ValidateOutputStep
from minion.steps.ingestion import GmailStep, JinaStep, ValidateInputStep
from minion.steps.publish import GithubStep, ImagenStep, PublishStep
from minion.steps.stubs import build_stub_steps
from minion.store.ports import ArticleStore

STEPS: tuple[Step, ...] = build_stub_steps()

__all__ = ["STEPS", "Step", "StepContext", "StepResult", "build_pipeline"]


def build_pipeline(
    gmail_client: GmailClient,
    jina_client: JinaClient,
    generate_runner: GenerateRunner,
    image_generator: ImageGenerator,
    prompt_rewriter: PromptRewriter,
    content_repo: ContentRepository,
    article_store: ArticleStore,
) -> tuple[Step, ...]:
    """The production pipeline: every step real (web push within `publish` is F-012)."""
    real: dict[StepName, Step] = {
        StepName.gmail: GmailStep(client=gmail_client),
        StepName.jina: JinaStep(client=jina_client),
        StepName.validate_input: ValidateInputStep(),
        StepName.assemble: AssembleStep(),
        StepName.generate: GenerateStep(runner=generate_runner),
        StepName.validate_output: ValidateOutputStep(),
        StepName.imagen: ImagenStep(
            image_generator=image_generator, prompt_rewriter=prompt_rewriter
        ),
        StepName.github: GithubStep(content_repo=content_repo, article_store=article_store),
        StepName.publish: PublishStep(article_store=article_store),
    }
    stubs = {step.name: step for step in build_stub_steps()}
    return tuple(real.get(name) or stubs[name] for name in STEP_ORDER)
