"""Tests for the real Gmail client over a fake googleapiclient Resource (T-2.1)."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta
from typing import Any

from minion.config import PARIS_TZ
from minion.ingest.gmail import GmailReaderClient, _window_query


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode("utf-8")).decode("ascii")


def _message(msg_id: str, sender: str, subject: str, html: str, internal_ms: int) -> dict[str, Any]:
    return {
        "id": msg_id,
        "internalDate": str(internal_ms),
        "payload": {
            "mimeType": "text/html",
            "headers": [
                {"name": "From", "value": sender},
                {"name": "Subject", "value": subject},
            ],
            "body": {"data": _b64(html)},
        },
    }


class _Exec:
    def __init__(self, value: Any) -> None:
        self._value = value

    def execute(self) -> Any:
        return self._value


class _Messages:
    def __init__(self, listing: dict[str, Any], by_id: dict[str, Any], rec: dict[str, Any]) -> None:
        self._listing = listing
        self._by_id = by_id
        self._rec = rec

    def list(self, *, userId: str, q: str, maxResults: int) -> _Exec:  # noqa: N803
        self._rec["q"] = q
        self._rec["maxResults"] = maxResults
        return _Exec(self._listing)

    def get(self, *, userId: str, id: str, format: str) -> _Exec:  # noqa: N803
        self._rec["get_ids"].append(id)
        return _Exec(self._by_id[id])


class _Users:
    def __init__(self, messages: _Messages) -> None:
        self._messages = messages

    def messages(self) -> _Messages:
        return self._messages


class _Service:
    def __init__(self, users: _Users) -> None:
        self._users = users

    def users(self) -> _Users:
        return self._users


def _build_service(messages: list[dict[str, Any]]) -> tuple[_Service, dict[str, Any]]:
    rec: dict[str, Any] = {"get_ids": []}
    listing = {"messages": [{"id": m["id"]} for m in messages]}
    by_id = {m["id"]: m for m in messages}
    return _Service(_Users(_Messages(listing, by_id, rec))), rec


def test_window_query_is_calendar_day_paris() -> None:
    q = _window_query("2026-06-01")
    start = datetime(2026, 6, 1, tzinfo=PARIS_TZ)
    end = start + timedelta(days=1)
    assert q == f"is:unread after:{int(start.timestamp())} before:{int(end.timestamp())}"


def test_fetch_parses_sender_subject_and_extracts_urls() -> None:
    msg = _message(
        "m1",
        "Tech Weekly <news@techweekly.com>",
        "Issue 42",
        '<a href="https://techweekly.com/p/post-a">A</a>'
        '<a href="https://techweekly.com/unsubscribe">x</a>',
        1_748_000_000_000,
    )
    service, _ = _build_service([msg])
    [nl] = GmailReaderClient(service=service).fetch_unread("2026-06-01")
    assert nl.sender == "Tech Weekly <news@techweekly.com>"
    assert nl.subject == "Issue 42"
    assert nl.candidate_urls == ["https://techweekly.com/p/post-a"]  # unsubscribe dropped


def test_decodes_unpadded_base64url_body() -> None:
    # Gmail returns base64url without padding; the client must pad before decoding.
    html = '<a href="https://news.co/article-xyz">Read</a>'
    unpadded = base64.urlsafe_b64encode(html.encode("utf-8")).rstrip(b"=").decode("ascii")
    assert len(unpadded) % 4 != 0  # genuinely unpadded
    msg = {
        "id": "m1",
        "internalDate": "1748000000000",
        "payload": {
            "mimeType": "text/html",
            "headers": [{"name": "From", "value": "a@news.co"}, {"name": "Subject", "value": "s"}],
            "body": {"data": unpadded},
        },
    }
    service, _ = _build_service([msg])
    [nl] = GmailReaderClient(service=service).fetch_unread("2026-06-01")
    assert nl.candidate_urls == ["https://news.co/article-xyz"]


def test_caps_at_max_newsletters() -> None:
    messages = [
        _message(f"m{i}", f"s{i}@x.com", f"sub {i}", f'<a href="https://x.com/{i}">x</a>', 1)
        for i in range(60)
    ]
    service, rec = _build_service(messages)
    result = GmailReaderClient(service=service).fetch_unread("2026-06-01")
    assert len(result) == 50  # MAX_NEWSLETTERS
    assert len(rec["get_ids"]) == 50  # only 50 bodies fetched


def test_auth_failure_propagates() -> None:
    class _Boom:
        def users(self) -> Any:
            raise RuntimeError("invalid_grant: token revoked")

    try:
        GmailReaderClient(service=_Boom()).fetch_unread("2026-06-01")
    except RuntimeError as exc:
        assert "invalid_grant" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("expected auth failure to propagate")
