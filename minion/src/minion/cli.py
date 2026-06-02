"""Command-line entrypoint: `python -m minion run --date YYYY-MM-DD`.

The composition root — it configures logging, picks the real clock, builds the Firestore
adapters, and drives `run_pipeline`. `build_stores` constructs the Firestore client lazily
so importing this module (and unit-testing the CLI) needs no GCP credentials.
"""

from __future__ import annotations

import re
from datetime import datetime

import click

from minion.clock import Clock, SystemClock
from minion.generate.ports import GenerateRunner
from minion.ingest.ports import GmailClient, JinaClient
from minion.logging import configure_logging
from minion.models import RunStatus
from minion.orchestrator import run_pipeline
from minion.steps import build_pipeline
from minion.store.ports import LockStore, RunStore

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validate_date(ctx: click.Context, param: click.Parameter, value: str | None) -> str | None:
    """Click callback: require a zero-padded, real YYYY-MM-DD (matches the schema pattern)."""
    if value is None:
        return None
    if not _DATE_RE.match(value):
        raise click.BadParameter("date must be YYYY-MM-DD (zero-padded)")
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise click.BadParameter(f"not a real date: {value}") from exc
    return value


def build_stores(clock: Clock) -> tuple[RunStore, LockStore]:
    """Construct the production Firestore-backed stores (lazy import — needs GCP creds)."""
    from google.cloud import firestore

    from minion.store.firestore import FirestoreLockStore, FirestoreRunStore

    client = firestore.Client()
    return FirestoreRunStore(client), FirestoreLockStore(client, clock)


def build_clients() -> tuple[GmailClient, JinaClient, GenerateRunner]:
    """Construct the production ingestion + generation clients (lazy import — need secrets)."""
    from minion.generate.runner import ClaudeGenerateRunner
    from minion.ingest.gmail import GmailReaderClient
    from minion.ingest.jina import JinaReaderClient

    return GmailReaderClient(), JinaReaderClient(), ClaudeGenerateRunner()


@click.group()
def cli() -> None:
    """Veilleur Minion — the daily tech-watch pipeline."""


@cli.command()
@click.option(
    "--date",
    default=None,
    callback=_validate_date,
    help="Run date YYYY-MM-DD (Europe/Paris). Defaults to today.",
)
def run(date: str | None) -> None:
    """Execute the pipeline for DATE (idempotent; replays overwrite)."""
    configure_logging()
    clock = SystemClock()
    target = date or clock.now().strftime("%Y-%m-%d")
    run_store, lock_store = build_stores(clock)
    gmail_client, jina_client, generate_runner = build_clients()
    steps = build_pipeline(gmail_client, jina_client, generate_runner)
    result = run_pipeline(
        target, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps
    )
    if result.status is RunStatus.failure:
        raise SystemExit(1)
