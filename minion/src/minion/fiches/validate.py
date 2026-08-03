"""Pure, deterministic validation for a generated fiche.

No copyright/quote-overlap logic here (unlike `minion.generate.validate`): each fiche call has
exactly one source, so there is nothing to cross-check between sources. Just the structural
minimum — the four required sections present, a non-empty theme, a length cap.
"""

from __future__ import annotations

from minion import config
from minion.fiches.models import GeneratedFiche
from minion.generate.models import ValidationError, ValidationReport

REQUIRED_SECTIONS: tuple[str, ...] = (
    "## Résumé",
    "## Points clés",
    "## Analyse approfondie",
    "## Pourquoi ça compte",
)


def validate_fiche(fiche: GeneratedFiche) -> ValidationReport:
    """Structural gate: required sections present, theme non-empty, body under the length cap."""
    errors: list[ValidationError] = []

    if not fiche.theme.strip():
        errors.append(ValidationError(code="theme_missing", message="fiche theme is empty"))

    for section in REQUIRED_SECTIONS:
        if section not in fiche.body:
            errors.append(
                ValidationError(
                    code="section_missing", message=f"fiche body is missing '{section}'"
                )
            )

    word_count = len(fiche.body.split())
    if word_count > config.MAX_FICHE_WORDS:
        errors.append(
            ValidationError(
                code="fiche_too_long",
                message=f"fiche {word_count} > {config.MAX_FICHE_WORDS} words",
            )
        )

    return ValidationReport(errors=errors)
