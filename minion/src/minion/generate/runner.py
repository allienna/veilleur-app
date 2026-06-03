# pyright: basic
# ^ subprocess boundary to the external `claude` CLI + the plugin's `/generate` command; like
#   store/firestore.py and the gmail/jina clients it is dropped to basic checking. Behaviour is
#   covered by test_generate_runner.py (subprocess mocked) and the gated integration test.
"""Production runner for the agentic `/generate` call (F-005 FR-2/FR-7, AD-2/AD-4/AD-9).

Promotes the F-001 `spike/claude_probe.py` invocation to production: spawns
`claude -p "/generate <context-file>" --permission-mode bypassPermissions` with the OAuth-only
env (`CLAUDE_CODE_OAUTH_TOKEN` injected, `ANTHROPIC_API_KEY` stripped — constitution §2.2), and
returns the raw artefact text on stdout. The assembled context and any prior-attempt validation
feedback are written to a temp JSON file whose path is passed to the command. Transport failures
(binary missing / timeout / non-zero exit) raise `GenerateTransportError`.
"""

from __future__ import annotations

import contextlib
import json
import os
import subprocess
import tempfile

from minion import config, secrets
from minion.generate.models import AssembledContext, GenerateInvocation
from minion.generate.ports import GenerateTransportError


def _parse_output(stdout: str) -> GenerateInvocation:
    """Unwrap the `claude --output-format json` envelope into artefact text + usage telemetry.

    The envelope is `{"result": "<artefact text>", "total_cost_usd": <float>, "usage": {...}}`.
    Fallback (F-011 plan AD-5): if stdout is not that envelope (plain text, or the artefact JSON
    itself — neither has a `result` key), treat the whole stdout as the artefact text with no cost.
    """
    try:
        envelope = json.loads(stdout)
    except json.JSONDecodeError:
        return GenerateInvocation(text=stdout)
    if not (isinstance(envelope, dict) and "result" in envelope):
        return GenerateInvocation(text=stdout)

    # Coerce defensively: a CLI that reports cost/usage in an unexpected JSON type must degrade to
    # null (the AD-5 fallback), never crash the runner with a ValueError outside the transport path.
    def _num(value: object) -> float | None:
        try:
            return float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None

    cost = _num(envelope.get("total_cost_usd"))
    usage = envelope.get("usage")
    tokens: int | None = None
    if isinstance(usage, dict):
        used = [_num(usage.get("input_tokens")), _num(usage.get("output_tokens"))]
        if any(t is not None for t in used):
            tokens = int(sum(t for t in used if t is not None))
    return GenerateInvocation(text=str(envelope["result"]), cost_usd=cost, tokens=tokens)


def _build_env() -> dict[str, str]:
    """Inherit env minus `ANTHROPIC_API_KEY`, then inject `CLAUDE_CODE_OAUTH_TOKEN` (§2.2)."""
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
    env["CLAUDE_CODE_OAUTH_TOKEN"] = secrets.require(config.ANTHROPIC_OAUTH_TOKEN_SECRET)
    return env


def _write_context(context: AssembledContext, feedback: list[str]) -> str:
    """Serialize the context + feedback to a temp JSON file; return its path."""
    payload = {
        "sources": [s.model_dump() for s in context.sources],
        "feedback": list(feedback),
    }
    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", prefix="generate-ctx-", delete=False, encoding="utf-8"
    ) as handle:
        json.dump(payload, handle)
        return handle.name


class ClaudeGenerateRunner:
    """`GenerateRunner` over the `claude` CLI subprocess."""

    def invoke(self, context: AssembledContext, feedback: list[str]) -> GenerateInvocation:
        context_path = _write_context(context, feedback)
        argv = [
            f"/generate {context_path}" if part == "/generate" else part
            for part in config.CLAUDE_CMD
        ]
        try:
            result = subprocess.run(
                argv,
                capture_output=True,
                text=True,
                timeout=config.CLAUDE_TIMEOUT.total_seconds(),
                env=_build_env(),
                check=False,
            )
        except FileNotFoundError as exc:
            raise GenerateTransportError("claude binary not found on PATH") from exc
        except subprocess.TimeoutExpired as exc:
            raise GenerateTransportError("claude /generate timed out") from exc
        finally:
            # Don't let cleanup mask a subprocess/timeout error if the temp file is already gone.
            with contextlib.suppress(FileNotFoundError):
                os.unlink(context_path)

        if result.returncode != 0:
            raise GenerateTransportError(
                f"claude /generate exited {result.returncode}: {result.stderr[:500]}"
            )
        return _parse_output(result.stdout)
