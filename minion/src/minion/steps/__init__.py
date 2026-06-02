"""The ordered pipeline-step registry.

`STEPS` is the canonical all-stub sequence (F-003), kept as the orchestrator's default.
`build_pipeline` assembles the *real* pipeline: real `gmail` / `jina` / `validate_input`
(F-004) and `assemble` / `generate` / `validate_output` (F-005) steps wired to their injected
clients, with the remaining three steps (`imagen`, `github`, `publish`) still stubs (F-006/
F-012 replace those). Either way the ordering is fixed by `STEP_ORDER`.
"""

from __future__ import annotations

from minion.config import STEP_ORDER
from minion.generate.ports import GenerateRunner
from minion.ingest.ports import GmailClient, JinaClient
from minion.models import StepName
from minion.steps.base import Step, StepContext, StepResult
from minion.steps.generation import AssembleStep, GenerateStep, ValidateOutputStep
from minion.steps.ingestion import GmailStep, JinaStep, ValidateInputStep
from minion.steps.stubs import build_stub_steps

STEPS: tuple[Step, ...] = build_stub_steps()

__all__ = ["STEPS", "Step", "StepContext", "StepResult", "build_pipeline"]


def build_pipeline(
    gmail_client: GmailClient,
    jina_client: JinaClient,
    generate_runner: GenerateRunner,
) -> tuple[Step, ...]:
    """The production pipeline: real ingestion + generation steps + stubs for the rest."""
    real: dict[StepName, Step] = {
        StepName.gmail: GmailStep(client=gmail_client),
        StepName.jina: JinaStep(client=jina_client),
        StepName.validate_input: ValidateInputStep(),
        StepName.assemble: AssembleStep(),
        StepName.generate: GenerateStep(runner=generate_runner),
        StepName.validate_output: ValidateOutputStep(),
    }
    stubs = {step.name: step for step in build_stub_steps()}
    return tuple(real.get(name) or stubs[name] for name in STEP_ORDER)
