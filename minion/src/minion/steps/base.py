"""Step contracts: the interface every pipeline step implements.

A `Step` is invoked with a `StepContext` (run identity, clock, a bound logger, and a shared
data bag carried across steps) and returns a `StepResult`. Raising from `run()` signals step
failure — the orchestrator records it and halts the run (AC-7). In F-003 every step is a
stub; F-004+ replace the bodies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from minion.clock import Clock
from minion.logging import BoundLogger
from minion.models import StepName


def _empty_bag() -> dict[str, object]:
    return {}


@dataclass
class StepContext:
    """Everything a step needs to run, plus the data bag shared across steps."""

    run_id: str
    date: str
    clock: Clock
    log: BoundLogger
    data: dict[str, object] = field(default_factory=_empty_bag)


@dataclass
class StepResult:
    """A step's canned output, merged into the run's shared data bag by the orchestrator."""

    payload: dict[str, object] = field(default_factory=_empty_bag)


class Step(Protocol):
    """A single ordered pipeline step."""

    name: StepName

    def run(self, ctx: StepContext) -> StepResult: ...
