"""Command-line entrypoint: `python -m minion run --date YYYY-MM-DD`.

The composition root — it configures logging, picks the real clock, builds the Firestore
adapters, and drives `run_pipeline`. `build_stores` constructs the Firestore client lazily
so importing this module (and unit-testing the CLI) needs no GCP credentials.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import TYPE_CHECKING

import click

if TYPE_CHECKING:
    from google.cloud import firestore

from minion.clock import Clock, SystemClock
from minion.generate.ports import GenerateRunner
from minion.ingest.ports import GmailClient, ScraperClient
from minion.logging import configure_logging
from minion.models import RunStatus
from minion.notify import Notifier
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


def build_firestore_client() -> firestore.Client:
    """Construct the single production Firestore client shared by the stores and the notifier
    (lazy import — needs GCP creds)."""
    from google.cloud import firestore

    return firestore.Client()


def build_stores(
    client: firestore.Client, clock: Clock
) -> tuple[RunStore, LockStore, ArticleStore]:
    """Construct the production Firestore-backed stores over `client`."""
    from minion.store.firestore import (
        FirestoreArticleStore,
        FirestoreLockStore,
        FirestoreRunStore,
    )

    return (
        FirestoreRunStore(client),
        FirestoreLockStore(client, clock),
        FirestoreArticleStore(client),
    )


def build_notifier(client: firestore.Client) -> Notifier | None:
    """Construct the production Web Push notifier (F-012): a Firestore subscription store over
    `client` plus the VAPID private key from Secret Manager.

    Returns ``None`` when the VAPID secret has no accessible version. Push is soft-fail
    (F-012 — "push failure never fails a run"); a missing notification credential must likewise
    never sink the daily pipeline, so we log a warning and let the orchestrator skip the
    run-completion push rather than crashing the whole run at startup."""
    import logging

    from minion import secrets
    from minion.config import VAPID_PRIVATE_KEY_SECRET
    from minion.logging import LOGGER_NAME
    from minion.notify import WebPushNotifier
    from minion.store.firestore import FirestoreSubscriptionStore

    try:
        vapid_private_key = secrets.require(VAPID_PRIVATE_KEY_SECRET)
    except secrets.MissingSecretError:
        logging.getLogger(LOGGER_NAME).warning(
            "VAPID secret %r has no version; run-completion push disabled for this run",
            VAPID_PRIVATE_KEY_SECRET,
        )
        return None
    subscriptions = FirestoreSubscriptionStore(client)
    return WebPushNotifier(subscriptions, vapid_private_key)


def build_clients() -> tuple[
    GmailClient, ScraperClient, GenerateRunner, ImageGenerator, PromptRewriter, ContentRepository
]:
    """Construct the production ingestion / generation / publishing clients (lazy — needs creds)."""
    from minion.generate.runner import ClaudeGenerateRunner
    from minion.ingest.gmail import GmailReaderClient
    from minion.ingest.scraper import LocalExtractorClient
    from minion.publish.github import GitHubContentRepository
    from minion.publish.imagen import ClaudePromptRewriter, VertexImageGenerator

    return (
        GmailReaderClient(),
        LocalExtractorClient(),
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
    client = build_firestore_client()
    run_store, lock_store, article_store = build_stores(client, clock)
    (
        gmail_client,
        scraper_client,
        generate_runner,
        image_generator,
        prompt_rewriter,
        content_repo,
    ) = build_clients()
    steps = build_pipeline(
        gmail_client,
        scraper_client,
        generate_runner,
        image_generator,
        prompt_rewriter,
        content_repo,
        article_store,
    )
    notifier = build_notifier(client)
    result = run_pipeline(
        target,
        run_store=run_store,
        lock_store=lock_store,
        clock=clock,
        steps=steps,
        notifier=notifier,
    )
    if result.status is RunStatus.failure:
        raise SystemExit(1)
