"""Imagen 4 Fast placeholder image generator for the Hello-Veilleur spike.

Generates one 16:9 image of the Le Veilleur mascot via Vertex AI Imagen, returns it
as WebP bytes. On moderation rejection or empty response, retries once. If both attempts
fail, raises `ImagenBlockedError` so the orchestrator can mark `imagen_status: "blocked"`
and continue (per the spec's error-scenarios table).

The hardcoded `SPIKE_IMAGEN_PROMPT` (AD-9) is mascot-only and on-brand per DESIGN.md §0,
which minimizes moderation risk for the spike.
"""

from __future__ import annotations

from io import BytesIO

from google import genai
from google.genai.types import GenerateImagesConfig
from PIL import Image as PILImage

PROJECT_ID = "veilleur-app"
LOCATION = "europe-west1"
MODEL = "imagen-4.0-fast-generate-001"

SPIKE_IMAGEN_PROMPT = (
    "Cartoon owl mascot 'Le Veilleur' — navy plumage, large amber eyes, "
    "friendly Pixar 3D style, looking curiously to the side, soft studio lighting, "
    "16:9 aspect ratio, white background."
)


class ImagenBlockedError(RuntimeError):
    """Raised when Imagen returns zero usable images on both retry attempts."""


_CLIENT: genai.Client | None = None


def _client() -> genai.Client:
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)
    return _CLIENT


def _convert_to_webp(raw: bytes) -> bytes:
    """Convert raw PNG/JPEG bytes to WebP at quality 85."""
    img = PILImage.open(BytesIO(raw))
    buf = BytesIO()
    img.save(buf, format="WEBP", quality=85)
    return buf.getvalue()


def generate_placeholder() -> bytes:
    """Return a 16:9 WebP image of the Le Veilleur mascot.

    Retries once on safety-filter rejection. Raises `ImagenBlockedError` if the second
    attempt also yields no usable image.
    """
    last_error: str = "no image returned"
    for _ in range(2):
        response = _client().models.generate_images(
            model=MODEL,
            prompt=SPIKE_IMAGEN_PROMPT,
            config=GenerateImagesConfig(aspect_ratio="16:9", number_of_images=1),
        )
        images = response.generated_images
        if images:
            generated = images[0]
            image_obj = generated.image
            if image_obj is not None and image_obj.image_bytes:
                return _convert_to_webp(image_obj.image_bytes)
            last_error = "image_bytes missing on returned image"
        else:
            last_error = "generated_images empty (safety filter or quota)"
    msg = f"Imagen returned 0 usable images after 2 attempts: {last_error}"
    raise ImagenBlockedError(msg)
