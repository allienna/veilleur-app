# pyright: basic
# ^ wraps the google-genai SDK (incomplete stubs) and the `claude` subprocess boundary; like
#   store/firestore.py and generate/runner.py it is dropped to basic checking. Behaviour is
#   covered by the in-memory fakes + the gated integration test (no Vertex/Claude in CI).
"""Production publishing adapters: Vertex Imagen image generation + Claude prompt rewrite (F-006).

`VertexImageGenerator` promotes `spike/imagen.py` to a single-shot `ImageGenerator`: it asks
Imagen for one 16:9 image and returns WebP bytes, raising `ImagenBlockedError` when nothing
usable comes back (moderation / empty / quota). The rewrite-then-placeholder fallback lives in
the `imagen` step, not here (plan AD-2).

`ClaudePromptRewriter` softens a rejected prompt via a one-shot `claude -p` call under the same
OAuth-only env as `/generate` (`CLAUDE_CODE_OAUTH_TOKEN` injected, `ANTHROPIC_API_KEY` stripped —
constitution §2.2).
"""

from __future__ import annotations

import os
import subprocess
from io import BytesIO

from google import genai
from google.genai.types import GenerateImagesConfig
from PIL import Image as PILImage

from minion import config, secrets
from minion.publish.ports import ImagenBlockedError

_REWRITE_INSTRUCTION = (
    "You are refining an image-generation prompt that a safety filter rejected. Rewrite it to be "
    "softer, gentler, and unambiguously safe-for-work while keeping the same subject and the "
    "Le Veilleur owl mascot. Reply with ONLY the rewritten prompt, no preamble.\n\n"
    "Rejection reason: {reason}\nOriginal prompt: {prompt}"
)


def _convert_to_webp(raw: bytes) -> bytes:
    """Convert raw PNG/JPEG bytes to WebP at the configured quality."""
    image = PILImage.open(BytesIO(raw))
    buffer = BytesIO()
    image.save(buffer, format="WEBP", quality=config.WEBP_QUALITY)
    return buffer.getvalue()


class VertexImageGenerator:
    """`ImageGenerator` over Vertex AI Imagen (`imagen-4.0-fast-generate-001`, IAM-only)."""

    def __init__(self) -> None:
        self._client: genai.Client | None = None

    def _get_client(self) -> genai.Client:
        if self._client is None:  # lazy — constructing the client needs ADC/IAM
            self._client = genai.Client(
                vertexai=True, project=config.IMAGEN_PROJECT_ID, location=config.IMAGEN_LOCATION
            )
        return self._client

    def generate(self, prompt: str) -> bytes:
        try:
            response = self._get_client().models.generate_images(
                model=config.IMAGEN_MODEL,
                prompt=prompt,
                config=GenerateImagesConfig(
                    aspect_ratio=config.IMAGEN_ASPECT_RATIO, number_of_images=1
                ),
            )
            images = response.generated_images
            if images:
                image_obj = images[0].image
                if image_obj is not None and image_obj.image_bytes:
                    return _convert_to_webp(image_obj.image_bytes)
        except Exception as exc:
            # Auth / quota / 5xx / network / Pillow decode — surface as ImagenBlockedError so the
            # step follows the rewrite/placeholder fallback rather than hard-failing the run (FR-2).
            raise ImagenBlockedError(f"Imagen generation failed: {exc}") from exc
        raise ImagenBlockedError("Imagen returned no usable image (safety filter, empty, or quota)")


def _build_env() -> dict[str, str]:
    """Inherit env minus `ANTHROPIC_API_KEY`, then inject `CLAUDE_CODE_OAUTH_TOKEN` (§2.2)."""
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
    env["CLAUDE_CODE_OAUTH_TOKEN"] = secrets.require(config.ANTHROPIC_OAUTH_TOKEN_SECRET)
    return env


class ClaudePromptRewriter:
    """`PromptRewriter` over a one-shot `claude -p` subprocess (OAuth-only env)."""

    def soften(self, prompt: str, reason: str) -> str:
        instruction = _REWRITE_INSTRUCTION.format(reason=reason, prompt=prompt)
        result = subprocess.run(
            ["claude", "-p", instruction, "--permission-mode", "bypassPermissions"],
            capture_output=True,
            text=True,
            timeout=config.CLAUDE_TIMEOUT.total_seconds(),
            env=_build_env(),
            check=False,
        )
        rewritten = result.stdout.strip()
        # A failed rewrite is non-fatal: fall back to the original prompt so the step can still
        # retry Imagen once before the placeholder (PRD §6 R2 — never hard-fail on the image).
        return rewritten or prompt
