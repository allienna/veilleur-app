"""Structured JSON logging for the Hello-Veilleur spike.

Per constitution §4: structured logs only, no `print()` outside this module.
Logger writes JSON lines to stdout — Cloud Logging auto-parses them.
"""

from __future__ import annotations

import logging as _stdlogging
import sys

from pythonjsonlogger.json import JsonFormatter

_CONFIGURED = False


def _configure_root() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    handler = _stdlogging.StreamHandler(sys.stdout)
    formatter = JsonFormatter(
        "{asctime} {levelname} {name} {message}",
        style="{",
        rename_fields={"asctime": "timestamp", "levelname": "level"},
    )
    handler.setFormatter(formatter)
    root = _stdlogging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(_stdlogging.INFO)

    # Quiet chatty third-party request loggers so only our step/summary lines show on stdout.
    for noisy in ("httpx", "httpcore", "google", "urllib3", "google_genai"):
        _stdlogging.getLogger(noisy).setLevel(_stdlogging.WARNING)

    _CONFIGURED = True


class _RunIdFilter(_stdlogging.Filter):
    """Tag every record with `run_id` so it appears as a top-level JSON field."""

    def __init__(self, run_id: str) -> None:
        super().__init__()
        self._run_id = run_id

    def filter(self, record: _stdlogging.LogRecord) -> bool:
        if not hasattr(record, "run_id"):
            record.run_id = self._run_id
        return True


def get_logger(run_id: str) -> _stdlogging.Logger:
    """Return a logger that injects `run_id` into every record it emits."""
    _configure_root()
    logger = _stdlogging.getLogger(f"minion.spike.{run_id}")
    logger.setLevel(_stdlogging.INFO)
    for existing in list(logger.filters):
        if isinstance(existing, _RunIdFilter):
            logger.removeFilter(existing)
    logger.addFilter(_RunIdFilter(run_id))
    return logger
