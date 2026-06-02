"""Generation port — the only `claude -p "/generate"` surface the step knows about (AD-2).

Mirrors `ingest/ports.py`: the `generate` step depends on this Protocol, `runner.py` implements
it over a subprocess, and `fakes.py` provides a hermetic double so the pipeline tests without the
`claude` binary, the plugin, or network.
"""

from __future__ import annotations

from typing import Protocol

from minion.generate.models import AssembledContext


class GenerateTransportError(RuntimeError):
    """A failure *invoking* `/generate` — binary missing, timeout, non-zero exit (FR-2).

    Distinct from a validation failure (which feeds the retry loop): transport errors get their
    own exponential-backoff retry and then hard-fail the run.
    """


class GenerateRunner(Protocol):
    """Runs one `/generate` invocation and returns its raw artefact text (stdout)."""

    def invoke(self, context: AssembledContext, feedback: list[str]) -> str:
        """Invoke `/generate` with the assembled context and any prior-attempt validation
        `feedback`, returning the raw artefact text. Raises `GenerateTransportError` on a
        transport failure; the caller parses + validates the returned text."""
        ...
