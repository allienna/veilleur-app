"""The ordered pipeline-step registry.

`STEPS` is the canonical sequence the orchestrator drives. In F-003 these are stubs
(`build_stub_steps`); later features swap individual bodies without touching the wiring.
"""

from __future__ import annotations

from minion.steps.base import Step, StepContext, StepResult
from minion.steps.stubs import build_stub_steps

STEPS: tuple[Step, ...] = build_stub_steps()

__all__ = ["STEPS", "Step", "StepContext", "StepResult"]
