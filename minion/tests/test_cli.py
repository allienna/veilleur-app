"""CLI tests — date validation exit codes and an end-to-end wired stub run."""

from __future__ import annotations

from click.testing import CliRunner

from minion import cli as cli_mod
from minion.cli import cli
from minion.clock import Clock
from minion.fiches.fakes import FakeFicheGenerateRunner
from minion.fiches.ports import FicheGenerateRunner
from minion.generate.fakes import FakeGenerateRunner
from minion.generate.ports import GenerateRunner
from minion.ingest.fakes import FakeGmailClient, FakeScraperClient
from minion.ingest.ports import GmailClient, ScraperClient
from minion.notify import Notifier
from minion.publish.fakes import (
    FakeContentRepository,
    FakeImageGenerator,
    FakePromptRewriter,
)
from minion.publish.ports import ContentRepository, ImageGenerator, PromptRewriter
from minion.store.memory import (
    InMemoryArticleStore,
    InMemoryFicheStore,
    InMemoryLockStore,
    InMemoryRunStore,
)
from minion.store.ports import ArticleStore, FicheStore


def test_calendar_invalid_date_exits_nonzero() -> None:
    result = CliRunner().invoke(cli, ["run", "--date", "2026-13-40"])
    assert result.exit_code != 0
    assert "not a real date" in result.output


def test_malformed_date_exits_nonzero() -> None:
    result = CliRunner().invoke(cli, ["run", "--date", "nope"])
    assert result.exit_code != 0
    assert "YYYY-MM-DD" in result.output


def test_non_padded_date_rejected() -> None:
    result = CliRunner().invoke(cli, ["run", "--date", "2026-6-1"])
    assert result.exit_code != 0


def test_build_notifier_returns_none_when_vapid_secret_missing(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    # Push is soft-fail (F-012): an empty/absent VAPID secret must not crash the pipeline at
    # startup — build_notifier degrades to None and the orchestrator simply skips the push.
    from minion import secrets

    def raise_missing(name: str) -> str:
        raise secrets.MissingSecretError(name)

    monkeypatch.setattr(secrets, "require", raise_missing)
    assert cli_mod.build_notifier(object()) is None


def test_build_notifier_returns_notifier_when_vapid_secret_present(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from minion import secrets
    from minion.notify import WebPushNotifier

    monkeypatch.setattr(secrets, "require", lambda name: "fake-vapid-key")
    notifier = cli_mod.build_notifier(object())
    assert isinstance(notifier, WebPushNotifier)


def test_wired_run_exits_zero(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def fake_client() -> object:
        return object()  # the in-memory stores ignore it; no real Firestore needed

    def fake_build(
        client: object, clock: Clock
    ) -> tuple[InMemoryRunStore, InMemoryLockStore, ArticleStore, FicheStore]:
        return (
            InMemoryRunStore(),
            InMemoryLockStore(clock),
            InMemoryArticleStore(),
            InMemoryFicheStore(),
        )

    def fake_clients() -> tuple[
        GmailClient,
        ScraperClient,
        GenerateRunner,
        ImageGenerator,
        PromptRewriter,
        ContentRepository,
        FicheGenerateRunner,
    ]:
        # Empty mailbox → run skips at validate_input, before generate/imagen/github/publish/fiches.
        return (
            FakeGmailClient(),
            FakeScraperClient(),
            FakeGenerateRunner(),
            FakeImageGenerator(),
            FakePromptRewriter(),
            FakeContentRepository(),
            FakeFicheGenerateRunner(),
        )

    class _NoopNotifier:
        """Stand-in notifier so the CLI test needs no Secret Manager / Firestore."""

        def notify(self, run: object) -> None:
            return None

    def fake_notifier(client: object) -> Notifier:
        return _NoopNotifier()

    monkeypatch.setattr(cli_mod, "build_firestore_client", fake_client)
    monkeypatch.setattr(cli_mod, "build_stores", fake_build)
    monkeypatch.setattr(cli_mod, "build_clients", fake_clients)
    monkeypatch.setattr(cli_mod, "build_notifier", fake_notifier)
    result = CliRunner().invoke(cli, ["run", "--date", "2026-06-01"])
    assert result.exit_code == 0, result.output  # skipped (no sources) is not a failure
