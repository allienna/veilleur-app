"""Tests for artefact parsing robustness (F-005, F-013 burn-in).

The agentic `/generate` model wraps the JSON artefact in a conversational preamble (and
sometimes trailing commentary). `_parse_article` must recover the embedded object rather than
fail `generate output unparseable`.
"""

from __future__ import annotations

import json

import pytest

from minion.steps.generation import _parse_article

_ARTEFACT = json.dumps(
    {
        "theme": "ai",
        "frontmatter": {
            "title": "T",
            "date": "2026-06-04",
            "description": "d",
            "tags": ["ai"],
        },
        "body": "Body text.",
        "linkedin": "post",
        "image_prompt": "prompt",
    }
)


def test_plain_json_parses() -> None:
    assert _parse_article(_ARTEFACT).theme == "ai"


def test_preamble_before_json_is_stripped() -> None:
    raw = f"Good. I have 6 usable tech sources (Famiflora is spam).\n\n{_ARTEFACT}"
    assert _parse_article(raw).frontmatter.title == "T"


def test_trailing_commentary_after_json_ignored() -> None:
    raw = f"{_ARTEFACT}\n\nThat's the artefact — let me know if you want changes."
    assert _parse_article(raw).body == "Body text."


def test_preamble_and_trailing_both_handled() -> None:
    raw = f"Composing now.\n\n{_ARTEFACT}\n\nDone."
    assert _parse_article(raw).theme == "ai"


def test_no_json_object_raises() -> None:
    with pytest.raises(json.JSONDecodeError):
        _parse_article("Sorry, I could not produce the artefact this time.")
