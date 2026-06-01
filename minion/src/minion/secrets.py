# pyright: basic
# ^ google-cloud-secret-manager ships incomplete type stubs (see pyproject reportMissingTypeStubs);
#   this SDK-boundary helper is dropped to basic checking, matching store/firestore.py.
"""Secret Manager helper — the production accessor for GCP secrets (F-004 AD-2).

Promoted out of the throwaway `spike/` package: the Hello-Veilleur spike proved the Secret
Manager chain, and F-004 needs it as strict-typed, type-checked production code (the spike
copy stays put but is pyright-excluded and slated for deletion).

Constitution §2 principle 2: `ANTHROPIC_API_KEY` MUST NOT be in env by default. Importing
this module refuses if the variable is set, blocking accidental activation of the API-key
fallback path.
"""

from __future__ import annotations

import os

from google.api_core.exceptions import NotFound
from google.cloud import secretmanager

PROJECT_ID = "veilleur-app"


class MissingSecretError(LookupError):
    """Raised by `require()` when a Secret Manager secret has no accessible version."""


def _assert_anthropic_api_key_absent() -> None:
    if os.environ.get("ANTHROPIC_API_KEY") is not None:
        msg = (
            "ANTHROPIC_API_KEY is set in env. Constitution §2 principle 2 forbids the "
            "API-key fallback path by default — unset it before running the Minion, or "
            "activate the fallback explicitly via a documented deviation PR."
        )
        raise RuntimeError(msg)


_assert_anthropic_api_key_absent()


_CLIENT: secretmanager.SecretManagerServiceClient | None = None


def _client() -> secretmanager.SecretManagerServiceClient:
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = secretmanager.SecretManagerServiceClient()
    return _CLIENT


def get(name: str) -> str:
    """Return the latest version's payload of secret `name` in the veilleur-app project.

    Raises `google.api_core.exceptions.NotFound` if the secret or its versions don't exist.
    Use `require()` if you want absence signalled as a domain-level `MissingSecretError`.
    """
    secret_path = f"projects/{PROJECT_ID}/secrets/{name}/versions/latest"
    response = _client().access_secret_version(request={"name": secret_path})
    return response.payload.data.decode("utf-8")


def require(name: str) -> str:
    """Return `get(name)`, but translate absence into a domain-level `MissingSecretError`."""
    try:
        return get(name)
    except NotFound as exc:
        msg = f"Secret {name!r} has no accessible version in project {PROJECT_ID!r}"
        raise MissingSecretError(msg) from exc
