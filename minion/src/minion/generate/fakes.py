"""Hermetic test double for the generation port (F-005 AD-2/AD-11).

`FakeGenerateRunner` returns scripted raw outputs (one per attempt) or raises a transport error,
and records the `feedback` passed on each invocation so tests can assert the retry loop forwards
validation errors.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from minion.generate.models import AssembledContext, GenerateInvocation


def _no_outputs() -> list[str]:
    return []


def _no_calls() -> list[list[str]]:
    return []


@dataclass
class FakeGenerateRunner:
    """Scripted `GenerateRunner`. Returns `outputs[attempt]` (repeating the last), or raises.

    `outputs` are artefact texts; each is wrapped in a `GenerateInvocation` carrying the optional
    `cost_usd`/`tokens` (same value for every scripted call) so cost-accumulation paths are
    testable without a real CLI.
    """

    outputs: list[str] = field(default_factory=_no_outputs)
    error: Exception | None = None
    cost_usd: float | None = None
    tokens: int | None = None
    calls: list[list[str]] = field(default_factory=_no_calls)

    def invoke(self, context: AssembledContext, feedback: list[str]) -> GenerateInvocation:
        self.calls.append(list(feedback))
        if self.error is not None:
            raise self.error
        if not self.outputs:
            raise AssertionError("FakeGenerateRunner needs `outputs` or an `error` configured")
        index = len(self.calls) - 1
        text = self.outputs[min(index, len(self.outputs) - 1)]
        return GenerateInvocation(text=text, cost_usd=self.cost_usd, tokens=self.tokens)
