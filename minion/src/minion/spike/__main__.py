"""CLI entry for the Hello-Veilleur spike.

Two subcommands:
- `run`: four-step probe chain (Gmail -> Imagen -> Firestore -> GitHub). Wired in T-3.1.
- `claude-probe`: OAuth headless probe (`claude -p` returns PONG). Wired in T-3.2.
"""

from __future__ import annotations

import datetime as dt
import time
from collections.abc import Iterator
from contextlib import contextmanager
from logging import Logger

import click

from minion.spike import claude_probe as claude_probe_mod
from minion.spike import firestore, github, gmail, imagen
from minion.spike.logging import get_logger
from minion.spike.models import SpikeRunRecord, make_run_id


def _today_iso() -> str:
    return dt.datetime.now(dt.UTC).date().isoformat()


@contextmanager
def _step(logger: Logger, name: str) -> Iterator[None]:
    """Time a step and emit exactly one structured log line (ok on success, error on raise)."""
    start = time.monotonic()
    try:
        yield
    except Exception:
        duration_ms = round((time.monotonic() - start) * 1000)
        logger.error(
            f"{name} failed", extra={"step": name, "status": "error", "duration_ms": duration_ms}
        )
        raise
    duration_ms = round((time.monotonic() - start) * 1000)
    logger.info(f"{name} ok", extra={"step": name, "status": "ok", "duration_ms": duration_ms})


@click.group()
def cli() -> None:
    """Hello-Veilleur spike — probe the full external-system chain."""


@cli.command()
@click.option(
    "--date",
    "date_",
    default=_today_iso,
    show_default="today (UTC)",
    metavar="YYYY-MM-DD",
    help="Run date used in the runId and GitHub commit path.",
)
def run(date_: str) -> None:
    """Run the four-step probe chain end-to-end for DATE.

    Gmail -> Imagen -> Firestore -> GitHub. Any step failure exits non-zero, except an
    Imagen safety block, which records `imagen_status="blocked"`, skips the GitHub commit
    (no image to publish), and still finishes successfully.
    """
    run_id = make_run_id(date_)
    logger = get_logger(run_id)
    record = SpikeRunRecord(
        run_id=run_id,
        started_at=dt.datetime.now(dt.UTC),
        imagen_status="ok",
    )

    # Step 1 — Gmail unread count.
    with _step(logger, "gmail"):
        record.gmail_unread_count = gmail.count_unread_last_24h()

    # Step 2 — Imagen placeholder. A safety block is non-fatal (the one allowed degradation).
    image: bytes | None = None
    try:
        with _step(logger, "imagen"):
            image = imagen.generate_placeholder()
        record.imagen_status = "ok"
        record.image_bytes_size = len(image) if image else None
    except imagen.ImagenBlockedError:
        record.imagen_status = "blocked"

    # Step 3 — Firestore partial write (observable state before the GitHub commit).
    with _step(logger, "firestore"):
        firestore.write_run(record)

    # Step 4 — GitHub commit (skipped if Imagen produced no image).
    if image is not None:
        with _step(logger, "github"):
            record.github_commit_sha = github.commit_image(date_, image)
    else:
        logger.info(
            "github skipped (no image)",
            extra={"step": "github", "status": "skipped", "duration_ms": 0},
        )

    # Finalize — update the same Firestore doc with ended_at + commit sha.
    record.ended_at = dt.datetime.now(dt.UTC)
    firestore.write_run(record)
    logger.info(
        "run complete",
        extra={
            "step": "summary",
            "status": record.imagen_status,
            "gmail_unread_count": record.gmail_unread_count,
            "image_bytes_size": record.image_bytes_size,
            "github_commit_sha": record.github_commit_sha,
        },
    )


@cli.command("claude-probe")
def claude_probe() -> None:
    """Probe `claude -p` returns PONG inside the current environment (R1 gate)."""
    logger = get_logger("probe")
    ok = claude_probe_mod.pong()
    logger.info(
        "claude probe",
        extra={"step": "claude_probe", "status": "ok" if ok else "failed"},
    )
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    cli()
