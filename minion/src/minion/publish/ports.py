"""Publishing ports — the only Vertex Imagen / Claude-rewrite / GitHub surfaces the steps know.

Mirrors `generate/ports.py` and `ingest/ports.py`: the publish steps depend on these Protocols,
`imagen.py` / `github.py` implement them over the real SDKs, and `fakes.py` provides hermetic
doubles. Retry/backoff and the moderation fallback live in the *steps* (plan AD-2), not here.
"""

from __future__ import annotations

from typing import Protocol


class ImagenBlockedError(RuntimeError):
    """Imagen returned no usable image — safety/moderation rejection, empty response, or quota.

    The `imagen` step catches this to drive the rewrite-then-placeholder fallback (FR-2); it is
    never a hard run failure on its own (PRD §6 R2 — graceful degradation).
    """


class ContentRepoError(RuntimeError):
    """A GitHub Contents API call failed (non-2xx or transport). The `github` step retries with
    backoff and, only after exhausting them, hard-fails the run (FR-3 / PRD §6)."""


class ImageGenerator(Protocol):
    """Generates one 16:9 hero image and returns it as WebP bytes."""

    def generate(self, prompt: str) -> bytes:
        """Generate a 16:9 WebP image for `prompt`. Raises `ImagenBlockedError` when no usable
        image comes back (moderation / empty / quota)."""
        ...


class PromptRewriter(Protocol):
    """Softens a rejected image prompt via an agentic `claude -p` call (FR-2)."""

    def soften(self, prompt: str, reason: str) -> str:
        """Return a softer, moderation-safer rewrite of `prompt` given the rejection `reason`."""
        ...


class ContentRepository(Protocol):
    """Commits a single file to the public Astro repo, idempotent by path (update-with-sha)."""

    def put_file(self, path: str, content: bytes, message: str) -> str:
        """Create or overwrite `path` with `content` and return the resulting commit SHA.
        Raises `ContentRepoError` on any non-2xx response or transport failure."""
        ...
