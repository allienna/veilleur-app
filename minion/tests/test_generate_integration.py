"""Gated integration test for the real `/generate` runner (T-3.8, AD-11).

Marked `integration` so it is deselected by default (`addopts = -m 'not integration'`) — CI /
build-minion stay hermetic. Run explicitly with `uv run pytest -m integration` on a host that
has the `claude` CLI, the `allienna/claude-feature-flow` plugin, and the OAuth token secret.
This test is the executable record of the AD-4 contract: `/generate` must emit a single JSON
document parseable into `GeneratedArticle`.
"""

from __future__ import annotations

import json
import shutil

import pytest

from minion.generate.models import AssembledContext, ContextSource, GeneratedArticle
from minion.generate.runner import ClaudeGenerateRunner


@pytest.mark.integration
def test_real_generate_emits_parseable_artefact() -> None:
    if shutil.which("claude") is None:
        pytest.skip("claude binary not on PATH")

    context = AssembledContext(
        sources=[
            ContextSource(
                url="https://example.com/cloud-news",
                title="Cloud News",
                markdown="# Cloud News\n\nA short note about cloud-native scheduling changes.",
            )
        ]
    )
    raw = ClaudeGenerateRunner().invoke(context, [])
    article = GeneratedArticle.model_validate(json.loads(raw))
    assert article.theme
    assert article.body
