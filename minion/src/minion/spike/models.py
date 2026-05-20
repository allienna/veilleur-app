"""Pydantic models for the Hello-Veilleur spike.

Single boundary model: `SpikeRunRecord`. Same shape serialized to Firestore and
to the structured log line. F-003 will replace it with the richer real model.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel

ImagenStatus = Literal["ok", "blocked", "error"]


class SpikeRunRecord(BaseModel):
    """One persisted record per spike invocation, stored at `runs/{run_id}` in Firestore."""

    run_id: str
    started_at: datetime
    ended_at: datetime | None = None
    gmail_unread_count: int | None = None
    imagen_status: ImagenStatus
    image_bytes_size: int | None = None
    github_commit_sha: str | None = None


def make_run_id(date: str) -> str:
    """Return `spike-{date}-{8hex}`.

    The `spike-` prefix isolates F-001 runs from the real runs F-003+ will produce (AD-8).
    """
    return f"spike-{date}-{uuid4().hex[:8]}"
