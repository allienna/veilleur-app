# pyright: basic
# ^ subprocess boundary to the `claude` CLI, like generate/runner.py and publish/imagen.py; same
#   basic-checking treatment. Behaviour is covered by test_fiches_extract.py (parser) and the
#   step's own tests (runner faked via FakeFicheGenerateRunner).
"""Production runner for the per-source fiche call.

No slash command exists for this (unlike `/generate`, shipped by the pinned `claude-feature-flow`
plugin — constitution §3): the prompt is authored here and passed to `claude -p` as a literal
instruction, same one-shot shape as `publish.imagen.ClaudePromptRewriter`. The source's markdown
is written to a temp file (as `generate.runner` does for the full context) so a long scrape never
has to survive shell-argument escaping.
"""

from __future__ import annotations

import contextlib
import json
import os
import subprocess
import tempfile

from minion import config, secrets
from minion.fiches.models import FicheInvocation
from minion.fiches.ports import FicheGenerateTransportError
from minion.generate.models import ContextSource

_PROMPT_TEMPLATE = (
    "Tu es un analyste tech. Lis le fichier JSON à ce chemin : {path} "
    '(champs : "title", "url", "markdown" — le contenu de la source). '
    "Rédige une fiche d'analyse de cette seule source, en français, avec EXACTEMENT ces "
    "sections markdown dans cet ordre :\n"
    "## Résumé\n## Points clés\n## Analyse approfondie\n## Pourquoi ça compte\n\n"
    "« Points clés » est une liste à puces. Les autres sections sont des paragraphes de prose.\n\n"
    "Réponds avec UN SEUL objet JSON, sans texte autour, avec exactement ces clés :\n"
    '{{"theme": "<un thème court, ex. IA, Sécurité, Data, Leadership, Tech>", '
    '"keywords": ["<3 à 6 mots-clés>"], '
    '"tone": "<opinion|tutorial|research|news, ou null si indéterminable>", '
    '"body": "<le markdown des 4 sections ci-dessus>"}}'
)


def _build_env() -> dict[str, str]:
    """Inherit env minus `ANTHROPIC_API_KEY`, then inject `CLAUDE_CODE_OAUTH_TOKEN` (§2.2)."""
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
    env["CLAUDE_CODE_OAUTH_TOKEN"] = secrets.require(config.ANTHROPIC_OAUTH_TOKEN_SECRET)
    return env


def _write_source(source: ContextSource) -> str:
    """Serialize `source` to a temp JSON file; return its path."""
    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", prefix="fiche-src-", delete=False, encoding="utf-8"
    ) as handle:
        json.dump(source.model_dump(), handle)
        return handle.name


def _parse_output(stdout: str) -> FicheInvocation:
    """Unwrap the `claude --output-format json` envelope into artefact text + usage telemetry.

    Same shape as `generate.runner._parse_output` (each `claude` boundary in this codebase keeps
    its own small copy — see also `publish.imagen`'s local `_build_env`), including the AD-5
    fallback: non-envelope stdout is treated as the artefact text itself, with no reported cost.
    """
    try:
        envelope = json.loads(stdout)
    except json.JSONDecodeError:
        return FicheInvocation(text=stdout)
    if not (isinstance(envelope, dict) and "result" in envelope):
        return FicheInvocation(text=stdout)

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
    return FicheInvocation(text=str(envelope["result"]), cost_usd=cost, tokens=tokens)


class ClaudeFicheGenerateRunner:
    """`FicheGenerateRunner` over the `claude` CLI subprocess, one call per source."""

    def invoke(self, source: ContextSource) -> FicheInvocation:
        source_path = _write_source(source)
        prompt = _PROMPT_TEMPLATE.format(path=source_path)
        try:
            result = subprocess.run(
                [
                    "claude",
                    "-p",
                    prompt,
                    "--permission-mode",
                    "bypassPermissions",
                    "--output-format",
                    "json",
                ],
                capture_output=True,
                text=True,
                timeout=config.FICHE_TIMEOUT.total_seconds(),
                env=_build_env(),
                check=False,
            )
        except FileNotFoundError as exc:
            raise FicheGenerateTransportError("claude binary not found on PATH") from exc
        except subprocess.TimeoutExpired as exc:
            raise FicheGenerateTransportError("claude fiche call timed out") from exc
        finally:
            # Don't let cleanup mask a subprocess/timeout error if the temp file is already gone.
            with contextlib.suppress(FileNotFoundError):
                os.unlink(source_path)

        if result.returncode != 0:
            raise FicheGenerateTransportError(
                f"claude fiche call exited {result.returncode}: "
                f"stderr={result.stderr[:300]!r} stdout={result.stdout[:500]!r}"
            )
        return _parse_output(result.stdout)
