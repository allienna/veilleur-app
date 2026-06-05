"""Structured JSON logging — the single sanctioned stdout boundary (constitution §4).

Every run emits newline-delimited JSON to stdout, each record carrying `runId` (and
`step`, where applicable) so Cloud Logging can correlate a run end to end (PRD §6). Nothing
else in the package writes to stdout; there is no `print` here, so ruff `T20` needs no
exemption for this module.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

from pythonjsonlogger.json import JsonFormatter

LOGGER_NAME = "minion"

_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


class _StdoutJsonHandler(logging.Handler):
    """Formats records as JSON and writes them to the *current* sys.stdout.

    Resolving the stream at emit time (rather than caching it like StreamHandler) keeps it
    correct under pytest's `capsys`, which swaps sys.stdout per test.
    """

    def __init__(self) -> None:
        super().__init__()
        self.setFormatter(JsonFormatter(_FORMAT))

    def emit(self, record: logging.LogRecord) -> None:
        try:
            sys.stdout.write(self.format(record) + "\n")
            # Flush every record: stdout is block-buffered when it isn't a TTY (Cloud Run pipes
            # it), so without this an uncatchable SIGKILL — e.g. the Cloud Run task timeout —
            # discards the buffered records and the run leaves no trace. A one-shot job emits few
            # lines, so per-record flush costs nothing (F-013 burn-in observability).
            sys.stdout.flush()
        except Exception:  # pragma: no cover - defensive, mirrors logging.StreamHandler
            self.handleError(record)


def configure_logging(level: int = logging.INFO) -> None:
    """Attach a single JSON stdout handler to the minion logger. Idempotent."""
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(level)
    logger.propagate = False
    if any(isinstance(h, _StdoutJsonHandler) for h in logger.handlers):
        return
    logger.addHandler(_StdoutJsonHandler())


class _BoundLogger(logging.LoggerAdapter[logging.Logger]):
    """LoggerAdapter that merges its bound context into each record's `extra`."""

    def process(self, msg: Any, kwargs: Any) -> tuple[Any, Any]:
        extra = {**(self.extra or {}), **kwargs.get("extra", {})}
        kwargs["extra"] = extra
        return msg, kwargs


BoundLogger = _BoundLogger
"""Public alias for the context-binding logger returned by :func:`bind`."""


def bind(run_id: str, step: str | None = None) -> _BoundLogger:
    """Return a logger that stamps `runId` (and optional `step`) onto every record."""
    context: dict[str, Any] = {"runId": run_id}
    if step is not None:
        context["step"] = step
    return _BoundLogger(logging.getLogger(LOGGER_NAME), context)
