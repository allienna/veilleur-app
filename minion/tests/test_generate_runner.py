"""Tests for the real Claude generate runner with subprocess mocked (T-2.2 / T-2.3).

No `claude` binary, plugin, or network — `subprocess.run` and the secret accessor are stubbed.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from typing import Any

import pytest

from minion import secrets
from minion.generate import runner as runner_mod
from minion.generate.models import AssembledContext, ContextSource
from minion.generate.ports import GenerateTransportError
from minion.generate.runner import ClaudeGenerateRunner

CONTEXT = AssembledContext(
    sources=[ContextSource(url="https://s.io/1", title="One", markdown="body")]
)


@dataclass
class _Completed:
    returncode: int
    stdout: str = ""
    stderr: str = ""


@pytest.fixture(autouse=True)
def _fake_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(secrets, "require", lambda name: "oauth-token-xyz")
    # Ensure the forbidden key is present in the parent env so we can prove it's stripped.
    monkeypatch.setenv("ANTHROPIC_API_KEY", "should-be-removed")


def _capture(monkeypatch: pytest.MonkeyPatch, result: Any) -> dict[str, Any]:
    captured: dict[str, Any] = {}

    def fake_run(argv: list[str], **kwargs: Any) -> Any:
        captured["argv"] = argv
        captured["env"] = kwargs.get("env", {})
        # Read the temp context file before the runner's finally-unlink removes it.
        ctx_arg = next(a for a in argv if a.startswith("/generate "))
        with open(ctx_arg.split(" ", 1)[1], encoding="utf-8") as handle:
            captured["payload"] = json.load(handle)
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(runner_mod.subprocess, "run", fake_run)
    return captured


def test_unwraps_json_envelope_with_cost_and_tokens(monkeypatch: pytest.MonkeyPatch) -> None:
    envelope = json.dumps(
        {
            "result": '{"theme":"ai"}',
            "total_cost_usd": 0.42,
            "usage": {"input_tokens": 1000, "output_tokens": 200},
        }
    )
    _capture(monkeypatch, _Completed(returncode=0, stdout=envelope))
    invocation = ClaudeGenerateRunner().invoke(CONTEXT, [])
    assert invocation.text == '{"theme":"ai"}'
    assert invocation.cost_usd == 0.42
    assert invocation.tokens == 1200


def test_falls_back_to_raw_text_without_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    # Plain artefact JSON (no `result` key) — treated as the artefact text, no cost (AD-5 fallback).
    _capture(monkeypatch, _Completed(returncode=0, stdout='{"theme":"ai"}'))
    invocation = ClaudeGenerateRunner().invoke(CONTEXT, [])
    assert invocation.text == '{"theme":"ai"}'
    assert invocation.cost_usd is None
    assert invocation.tokens is None


def test_non_numeric_cost_degrades_to_none(monkeypatch: pytest.MonkeyPatch) -> None:
    # A non-numeric `total_cost_usd`/usage must degrade to null, never crash the runner (AD-5).
    envelope = json.dumps(
        {"result": "{}", "total_cost_usd": "oops", "usage": {"input_tokens": "x"}}
    )
    _capture(monkeypatch, _Completed(returncode=0, stdout=envelope))
    invocation = ClaudeGenerateRunner().invoke(CONTEXT, [])
    assert invocation.text == "{}"
    assert invocation.cost_usd is None
    assert invocation.tokens is None


def test_argv_carries_generate_and_bypass_permissions(monkeypatch: pytest.MonkeyPatch) -> None:
    cap = _capture(monkeypatch, _Completed(returncode=0, stdout="{}"))
    ClaudeGenerateRunner().invoke(CONTEXT, [])
    assert "--permission-mode" in cap["argv"] and "bypassPermissions" in cap["argv"]
    assert any(a.startswith("/generate ") for a in cap["argv"])


def test_env_has_oauth_and_no_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    cap = _capture(monkeypatch, _Completed(returncode=0, stdout="{}"))
    ClaudeGenerateRunner().invoke(CONTEXT, [])
    assert cap["env"]["CLAUDE_CODE_OAUTH_TOKEN"] == "oauth-token-xyz"
    assert "ANTHROPIC_API_KEY" not in cap["env"]


def test_feedback_forwarded_into_context_file(monkeypatch: pytest.MonkeyPatch) -> None:
    cap = _capture(monkeypatch, _Completed(returncode=0, stdout="{}"))
    ClaudeGenerateRunner().invoke(CONTEXT, ["fix the linkedin length", "add attribution"])
    assert cap["payload"]["feedback"] == ["fix the linkedin length", "add attribution"]
    assert cap["payload"]["sources"][0]["url"] == "https://s.io/1"


def test_binary_missing_raises_transport_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _capture(monkeypatch, FileNotFoundError("no claude"))
    with pytest.raises(GenerateTransportError, match="not found"):
        ClaudeGenerateRunner().invoke(CONTEXT, [])


def test_timeout_raises_transport_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _capture(monkeypatch, subprocess.TimeoutExpired(cmd="claude", timeout=1))
    with pytest.raises(GenerateTransportError, match="timed out"):
        ClaudeGenerateRunner().invoke(CONTEXT, [])


def test_nonzero_exit_raises_transport_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _capture(monkeypatch, _Completed(returncode=2, stderr="boom"))
    with pytest.raises(GenerateTransportError, match="exited 2"):
        ClaudeGenerateRunner().invoke(CONTEXT, [])
