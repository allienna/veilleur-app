"""Stub implementations of the nine pipeline steps (F-003).

Each stub logs and returns canned, schema-shaped payload — no external calls. F-004+ replace
these bodies with real Gmail/Jina/generate/Imagen/GitHub/publish logic against the same
`Step` contract and ordering.
"""

from __future__ import annotations

from dataclasses import dataclass

from minion.config import STEP_ORDER
from minion.models import StepName
from minion.steps.base import StepContext, StepResult

# Canned, right-shaped output per step — placeholder until the real steps land.
_CANNED_PAYLOADS: dict[StepName, dict[str, object]] = {
    StepName.gmail: {"newsletters": []},
    StepName.jina: {"articles": []},
    StepName.validate_input: {"valid": True, "sources": 0},
    StepName.assemble: {"context": ""},
    StepName.generate: {"article": None, "linkedin": "", "imagePrompt": ""},
    StepName.validate_output: {"valid": True},
    StepName.imagen: {"imageBytes": None},
    StepName.github: {"commit": None},
    StepName.publish: {"notified": False},
}


@dataclass
class StubStep:
    """A no-op step that logs and returns its canned payload."""

    name: StepName
    payload: dict[str, object]

    def run(self, ctx: StepContext) -> StepResult:
        ctx.log.info("step executing (stub)")
        return StepResult(payload=dict(self.payload))


def build_stub_steps() -> tuple[StubStep, ...]:
    """One stub per canonical step, in execution order (driven by STEP_ORDER)."""
    return tuple(StubStep(name=name, payload=dict(_CANNED_PAYLOADS[name])) for name in STEP_ORDER)
