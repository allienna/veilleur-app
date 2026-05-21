"""Claude OAuth headless probe — the load-bearing R1 close-out gate.

Invokes `claude -p` against `CLAUDE_CODE_OAUTH_TOKEN` (mounted from Secret Manager).
Constitution §2 principle 2: `ANTHROPIC_API_KEY` must NOT be in env — `_build_env`
explicitly removes it before spawning the subprocess.

This module is what T-4.4 executes inside the deployed Cloud Run container. A successful
`pong()` there proves the Claude Code Max 5x OAuth path survives the container boundary,
closing PRD §10 R1.
"""

from __future__ import annotations

import os
import subprocess

from minion.spike import secrets
from minion.spike.logging import get_logger

_LOGGER = get_logger("probe")

_CLAUDE_CMD = [
    "claude",
    "-p",
    "--permission-mode",
    "bypassPermissions",
    "Output the word PONG and nothing else.",
]
_TIMEOUT_S = 60


def _build_env() -> dict[str, str]:
    """Inherit current env minus `ANTHROPIC_API_KEY`, then inject `CLAUDE_CODE_OAUTH_TOKEN`."""
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
    env["CLAUDE_CODE_OAUTH_TOKEN"] = secrets.require("anthropic-oauth-token")
    return env


def pong() -> bool:
    """Run `claude -p` and return True iff stdout starts with `PONG`.

    On binary-not-found / timeout / non-zero exit / unexpected output, emits a structured
    error log line and returns False.
    """
    try:
        result = subprocess.run(
            _CLAUDE_CMD,
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
            env=_build_env(),
            check=False,
        )
    except FileNotFoundError:
        _LOGGER.error("claude binary not found on PATH", extra={"step": "claude_probe"})
        return False
    except subprocess.TimeoutExpired:
        _LOGGER.error(
            "claude probe timed out",
            extra={"step": "claude_probe", "timeout_s": _TIMEOUT_S},
        )
        return False

    if result.returncode != 0 or not result.stdout.strip().startswith("PONG"):
        _LOGGER.error(
            "claude probe failed",
            extra={
                "step": "claude_probe",
                "returncode": result.returncode,
                "stdout": result.stdout[:500],
                "stderr": result.stderr[:500],
            },
        )
        return False

    return True
