"""Real generation steps (F-005): `assemble`, `generate`, `validate_output`.

These replace the F-003 stub bodies for pipeline slots 4-6; the remaining three steps
(`imagen`, `github`, `publish`) stay stubs (F-006/F-012). The agentic retry loop is
encapsulated in `GenerateStep` (it owns the runner + feedback); `ValidateOutputStep` is the
deterministic gate of record over the report `GenerateStep` stored (AD-3).

Data bag contract:
- `assemble`        -> reads `sources`, writes `context: AssembledContext`
- `generate`        -> reads `context`, writes `article` + `report` (GeneratedArticle/Report)
- `validate_output` -> reads `report`, gates the run
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import cast

from pydantic import ValidationError as PydanticValidationError

from minion import config
from minion.generate.assemble import assemble_context
from minion.generate.models import (
    AssembledContext,
    GeneratedArticle,
    ValidationError,
    ValidationReport,
)
from minion.generate.ports import GenerateRunner, GenerateTransportError
from minion.generate.validate import validate_article
from minion.ingest.models import SourceSet
from minion.models import StepName
from minion.steps.base import StepContext, StepResult


class GenerationFailedError(RuntimeError):
    """Raised by `generate` when validation retries are exhausted (run failure, FR-6)."""


class OutputValidationError(RuntimeError):
    """Raised by `validate_output` if the stored report is not OK (fail closed, AD-3)."""


def _parse_article(raw: str) -> GeneratedArticle:
    """Parse the runner's stdout JSON into a `GeneratedArticle` (raises on malformed output)."""
    return GeneratedArticle.model_validate(json.loads(raw))


@dataclass
class AssembleStep:
    """Step 4: package the validated sources into the `/generate` context bundle (FR-1)."""

    name: StepName = StepName.assemble

    def run(self, ctx: StepContext) -> StepResult:
        source_set = cast("SourceSet", ctx.data.get("sources") or SourceSet(sources=[]))
        context = assemble_context(source_set, log=ctx.log)
        ctx.log.info("context assembled", extra={"sources": len(context.sources)})
        return StepResult(payload={"context": context})


@dataclass
class GenerateStep:
    """Step 5: the agentic call + validation-retry loop (AD-3, FR-2/FR-6).

    Owns the `GenerateRunner`. Each attempt invokes `/generate` (with its own transport-retry),
    parses + validates the artefact, and on validation failure re-invokes with the errors fed
    back, up to `MAX_GENERATE_RETRIES`. Stores the validated article + report, or raises.
    """

    runner: GenerateRunner
    sleep: Callable[[float], None] = time.sleep
    name: StepName = StepName.generate

    def _invoke(self, context: AssembledContext, feedback: list[str]) -> str:
        """One logical invocation with transport-retry + exponential backoff (FR-2, AC-7)."""
        for attempt in range(config.CLAUDE_TRANSPORT_RETRIES + 1):
            try:
                return self.runner.invoke(context, feedback)
            except GenerateTransportError:
                if attempt >= config.CLAUDE_TRANSPORT_RETRIES:
                    raise
                self.sleep(config.CLAUDE_BACKOFF_BASE.total_seconds() * (2**attempt))
        raise AssertionError("unreachable")  # pragma: no cover

    def run(self, ctx: StepContext) -> StepResult:
        context = cast("AssembledContext", ctx.data.get("context") or AssembledContext(sources=[]))
        feedback: list[str] = []
        last_errors: list[ValidationError] = []

        for attempt in range(config.MAX_GENERATE_RETRIES + 1):
            raw = self._invoke(context, feedback)
            try:
                article = _parse_article(raw)
            except (json.JSONDecodeError, PydanticValidationError) as exc:
                last_errors = [ValidationError(code="unparseable_output", message=str(exc)[:200])]
                feedback = [e.message for e in last_errors]
                ctx.log.warning("generate output unparseable", extra={"attempt": attempt})
                continue

            if article.theme not in config.THEME_ALLOWLIST:
                article = article.model_copy(update={"theme": config.DEFAULT_THEME})

            report = validate_article(article, context.sources)
            if report.ok:
                ctx.log.info(
                    "article generated", extra={"attempt": attempt, "theme": article.theme}
                )
                return StepResult(payload={"article": article, "report": report})

            last_errors = report.errors
            feedback = [e.message for e in report.errors]
            ctx.log.warning(
                "article failed validation",
                extra={"attempt": attempt, "errors": [e.code for e in report.errors]},
            )

        codes = ", ".join(e.code for e in last_errors)
        raise GenerationFailedError(
            f"validation failed after {config.MAX_GENERATE_RETRIES} retries: {codes}"
        )


@dataclass
class ValidateOutputStep:
    """Step 6: the deterministic gate of record over the stored report (AD-3, constitution §4)."""

    name: StepName = StepName.validate_output

    def run(self, ctx: StepContext) -> StepResult:
        report = cast("ValidationReport", ctx.data.get("report") or ValidationReport(errors=[]))
        if not report.ok:
            codes = ", ".join(e.code for e in report.errors)
            raise OutputValidationError(f"output validation failed: {codes}")
        ctx.log.info("output validated")
        return StepResult()
