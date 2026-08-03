"""Hermetic test double for the fiche-generation port.

Mirrors `minion.generate.fakes.FakeGenerateRunner`, but keyed by source URL: each source in a
step's batch needs its own scripted outcome (success text, or a failure), unlike the single
whole-article call `FakeGenerateRunner` scripts by attempt index.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from minion.fiches.models import FicheInvocation
from minion.fiches.ports import FicheGenerateTransportError
from minion.generate.models import ContextSource


def _no_outputs() -> dict[str, str]:
    return {}


def _no_failures() -> frozenset[str]:
    return frozenset()


def _no_calls() -> list[str]:
    return []


@dataclass
class FakeFicheGenerateRunner:
    """Scripted `FicheGenerateRunner`. `outputs[source.url]` is the artefact text to return;
    `fail_urls` raises `FicheGenerateTransportError` for the matching source instead. Records
    every invoked URL in `calls` so partial-failure tests can assert on what ran."""

    outputs: dict[str, str] = field(default_factory=_no_outputs)
    fail_urls: frozenset[str] = field(default_factory=_no_failures)
    cost_usd: float | None = None
    tokens: int | None = None
    calls: list[str] = field(default_factory=_no_calls)

    def invoke(self, source: ContextSource) -> FicheInvocation:
        self.calls.append(source.url)
        if source.url in self.fail_urls:
            raise FicheGenerateTransportError(f"scripted failure for {source.url}")
        text = self.outputs.get(source.url)
        if text is None:
            raise AssertionError(f"FakeFicheGenerateRunner has no output scripted for {source.url}")
        return FicheInvocation(text=text, cost_usd=self.cost_usd, tokens=self.tokens)
