"""Tests for the structured logging boundary."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from minion.clock import FrozenClock
from minion.config import PARIS_TZ
from minion.logging import LOGGER_NAME, bind, configure_logging
from minion.orchestrator import run_pipeline
from minion.store.memory import InMemoryLockStore, InMemoryRunStore


def test_record_is_json_with_bound_runid(capsys) -> None:  # type: ignore[no-untyped-def]
    configure_logging()
    bind("01ABCDEF").info("hello")
    line = capsys.readouterr().out.strip().splitlines()[-1]
    payload = json.loads(line)
    assert payload["runId"] == "01ABCDEF"
    assert payload["message"] == "hello"


def test_bound_step_is_included() -> None:
    configure_logging()
    log = bind("01ABCDEF", step="gmail")
    assert log.extra == {"runId": "01ABCDEF", "step": "gmail"}


def test_configure_logging_is_idempotent() -> None:
    configure_logging()
    configure_logging()
    assert len(logging.getLogger(LOGGER_NAME).handlers) == 1


def test_run_logs_are_json_and_carry_runid(capsys) -> None:  # type: ignore[no-untyped-def]
    configure_logging()
    clock = FrozenClock(datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ))
    final = run_pipeline(
        "2026-06-01",
        run_store=InMemoryRunStore(),
        lock_store=InMemoryLockStore(clock),
        clock=clock,
    )
    lines = [ln for ln in capsys.readouterr().out.splitlines() if ln.strip()]
    payloads = [json.loads(ln) for ln in lines]  # every line is valid JSON (AC-9)
    assert payloads
    assert {p["runId"] for p in payloads} == {final.runId}  # all tagged with this run's id
    assert any(p.get("step") for p in payloads)  # per-step logs carry the step name
