"""Tolerant JSON-object extraction from an agentic artefact.

A near-duplicate of `minion.steps.generation._extract_json_object` — pyright's strict mode
(reportPrivateUsage) rightly blocks importing a leading-underscore name across modules, and this
codebase's convention for a `claude`-boundary adapter is a small local copy (see also
`publish.imagen`'s own `_build_env`) rather than promoting it to a shared module for two callers.
"""

from __future__ import annotations

import json


def extract_json_object(raw: str) -> object:
    """Return the first complete JSON object embedded in `raw`.

    The agentic model often wraps the artefact JSON in a conversational preamble and sometimes
    trailing commentary, so requiring the whole string to be JSON spuriously fails. Try a strict
    parse first, then scan from each `{` and return the first span that decodes.
    """
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    decoder = json.JSONDecoder()
    idx = raw.find("{")
    while idx != -1:
        try:
            obj, _ = decoder.raw_decode(raw[idx:])
            return obj
        except json.JSONDecodeError:
            idx = raw.find("{", idx + 1)
    raise json.JSONDecodeError("no JSON object found in artefact output", raw, 0)
