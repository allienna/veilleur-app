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
from minion.publish.ports import ContentRepository, ImageGenerator, PromptRewriter
from minion.steps import build_pipeline
from minion.store.ports import ArticleStore, LockStore, RunStore

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


def build_stores(clock: Clock) -> tuple[RunStore, LockStore, ArticleStore]:
    """Construct the production Firestore-backed stores (lazy import — needs GCP creds)."""
    from google.cloud import firestore

    from minion.store.firestore import (
        FirestoreArticleStore,
        FirestoreLockStore,
        FirestoreRunStore,
    )

    client = firestore.Client()
    return (
        FirestoreRunStore(client),
        FirestoreLockStore(client, clock),
        FirestoreArticleStore(client),
    )


def build_clients() -> tuple[
    GmailClient, JinaClient, GenerateRunner, ImageGenerator, PromptRewriter, ContentRepository
]:
    """Construct the production ingestion / generation / publishing clients (lazy — needs creds)."""
    from minion.generate.runner import ClaudeGenerateRunner
    from minion.ingest.gmail import GmailReaderClient
    from minion.ingest.jina import JinaReaderClient
    from minion.publish.github import GitHubContentRepository
    from minion.publish.imagen import ClaudePromptRewriter, VertexImageGenerator

    return (
        GmailReaderClient(),
        JinaReaderClient(),
        ClaudeGenerateRunner(),
        VertexImageGenerator(),
        ClaudePromptRewriter(),
        GitHubContentRepository(),
    )


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
    run_store, lock_store, article_store = build_stores(clock)
    gmail_client, jina_client, generate_runner, image_generator, prompt_rewriter, content_repo = (
        build_clients()
    )
    steps = build_pipeline(
        gmail_client,
        jina_client,
        generate_runner,
        image_generator,
        prompt_rewriter,
        content_repo,
        article_store,
    )
    result = run_pipeline(
        target, run_store=run_store, lock_store=lock_store, clock=clock, steps=steps
    )
    if result.status is RunStatus.failure:
        raise SystemExit(1)
