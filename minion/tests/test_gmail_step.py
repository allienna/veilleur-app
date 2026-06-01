"""Tests for GmailStep over FakeGmailClient (T-3.1)."""

from __future__ import annotations

from datetime import datetime

import pytest

from minion import config
from minion.clock import FrozenClock
from minion.config import PARIS_TZ
from minion.ingest.fakes import FakeGmailClient
from minion.ingest.models import Newsletter
from minion.logging import bind
from minion.steps.base import StepContext
from minion.steps.ingestion import GmailStep

T0 = datetime(2026, 6, 1, 6, 0, tzinfo=PARIS_TZ)


def _ctx() -> StepContext:
    return StepContext(run_id="RUN", date="2026-06-01", clock=FrozenClock(T0), log=bind("RUN"))


def _newsletter(sender: str, urls: list[str]) -> Newsletter:
    return Newsletter(sender=sender, subject="s", received_at=T0, candidate_urls=urls)


def test_collects_and_dedupes_urls_across_newsletters() -> None:
    client = FakeGmailClient(
        newsletters=[
            _newsletter("a@x.com", ["https://x.com/1", "https://x.com/2"]),
            _newsletter("b@y.com", ["https://x.com/2", "https://y.com/3"]),
        ]
    )
    result = GmailStep(client=client).run(_ctx())
    assert result.payload["candidate_urls"] == [
        "https://x.com/1",
        "https://x.com/2",
        "https://y.com/3",
    ]
    assert len(result.payload["newsletters"]) == 2  # type: ignore[arg-type]


def test_denylist_filters_by_domain(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "EXCLUDED_SENDERS", frozenset({"@spam.com"}))
    client = FakeGmailClient(
        newsletters=[
            _newsletter("Promo <promo@spam.com>", ["https://spam.com/ad"]),
            _newsletter("Real <news@good.com>", ["https://good.com/post"]),
        ]
    )
    result = GmailStep(client=client).run(_ctx())
    assert result.payload["candidate_urls"] == ["https://good.com/post"]
    assert len(result.payload["newsletters"]) == 1  # type: ignore[arg-type]


def test_denylist_filters_by_exact_address(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "EXCLUDED_SENDERS", frozenset({"noisy@news.com"}))
    client = FakeGmailClient(newsletters=[_newsletter("noisy@news.com", ["https://news.com/x"])])
    result = GmailStep(client=client).run(_ctx())
    assert result.payload["candidate_urls"] == []


def test_url_cap_truncates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "MAX_URLS", 3)
    client = FakeGmailClient(
        newsletters=[_newsletter("a@x.com", [f"https://x.com/{i}" for i in range(10)])]
    )
    result = GmailStep(client=client).run(_ctx())
    assert len(result.payload["candidate_urls"]) == 3  # type: ignore[arg-type]


def test_auth_failure_propagates() -> None:
    client = FakeGmailClient(error=RuntimeError("invalid_grant"))
    with pytest.raises(RuntimeError, match="invalid_grant"):
        GmailStep(client=client).run(_ctx())
