"""Deterministic slug + Astro content-file serialization (F-006 plan AD-6).

Pure functions, no I/O. A dependency-free YAML emitter keeps the frontmatter contract small and
auditable (the field set is fully controlled by `ArticleFrontmatter`) and avoids a `pyyaml`
review. Stable field ordering keeps GitHub commits byte-idempotent across replays.
"""

from __future__ import annotations

import re
import unicodedata

from minion import config
from minion.generate.models import GeneratedArticle

_NON_SLUG = re.compile(r"[^a-z0-9]+")
# Frontmatter field order: the required set (constitution/F-005) then the publish-filled fields.
_FIELD_ORDER: tuple[str, ...] = (*config.REQUIRED_FRONTMATTER_FIELDS, "image", "kind")


def slugify(title: str) -> str:
    """Turn a title into a URL-safe slug: NFKD ASCII-fold → lowercase → hyphenate → cap length.

    Falls back to "post" when the title has no slug-able characters (e.g. all punctuation).
    """
    folded = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii")
    slug = _NON_SLUG.sub("-", folded.lower()).strip("-")
    slug = slug[: config.SLUG_MAX_LEN].rstrip("-")  # trim any hyphen left by truncation
    return slug or "post"


def _yaml_scalar(value: str) -> str:
    """Emit a double-quoted YAML scalar with `"` and `\\` escaped."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _yaml_flow_seq(values: list[str]) -> str:
    """Emit a YAML flow sequence, e.g. `["ai", "cloud"]`."""
    return "[" + ", ".join(_yaml_scalar(v) for v in values) + "]"


def render_post(article: GeneratedArticle) -> str:
    """Serialize the article to an Astro content file: `---\\n<yaml>\\n---\\n\\n<body>\\n`."""
    fm = article.frontmatter
    fields: dict[str, str | list[str]] = {
        "title": fm.title,
        "date": fm.date,
        "description": fm.description,
        "tags": fm.tags,
        "image": fm.image,
        "kind": fm.kind,
    }
    lines: list[str] = []
    for name in _FIELD_ORDER:
        value = fields[name]
        rendered = _yaml_flow_seq(value) if isinstance(value, list) else _yaml_scalar(value)
        lines.append(f"{name}: {rendered}")
    return "---\n" + "\n".join(lines) + "\n---\n\n" + article.body + "\n"
