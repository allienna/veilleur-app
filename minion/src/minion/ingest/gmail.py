# pyright: basic
# ^ google-api-python-client builds its Resource chain dynamically and ships incomplete
#   stubs (see pyproject reportMissingTypeStubs); this SDK-boundary client is dropped to basic
#   checking, matching store/firestore.py and secrets.py. Behaviour is covered by the
#   gmail-step tests via FakeGmailClient and this module's own tests via a fake Resource.
"""Production Gmail client (F-004 FR-1) — fetch unread newsletters over a date window.

Promotes the F-001 spike's proven OAuth chain (`gmail-oauth-refresh-token` secret,
`gmail.readonly` scope) from a count-only probe to a real body-fetching ingestion client.
The 24h window is anchored to the run `date` in Europe/Paris for replayable idempotency
(AD-4): the calendar day `[date 00:00, date+1d 00:00)`, expressed as Unix-epoch
`after:`/`before:` bounds in the Gmail query.

Read-only: messages are never marked read (that would need the broader gmail.modify scope and
would break date-keyed replay).
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta
from email.utils import parseaddr
from typing import Any

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from minion import secrets
from minion.config import GMAIL_REFRESH_TOKEN_SECRET, GMAIL_SCOPES, MAX_NEWSLETTERS, PARIS_TZ
from minion.ingest.extract import extract_article_urls
from minion.ingest.models import Newsletter

_DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _credentials() -> Credentials:
    """Build short-lived Gmail credentials from the operator's refresh-token JSON secret."""
    info: dict[str, Any] = json.loads(secrets.require(GMAIL_REFRESH_TOKEN_SECRET))
    return Credentials(
        token=None,
        refresh_token=info["refresh_token"],
        client_id=info["client_id"],
        client_secret=info["client_secret"],
        token_uri=info.get("token_uri", _DEFAULT_TOKEN_URI),
        scopes=list(GMAIL_SCOPES),
    )


def _window_query(date: str) -> str:
    """Gmail query for unread messages in the 24h preceding `date`'s 06:00 Paris run time, AD-4.

    Anchored at 06:00 (the cron fire time, `infra/scheduler.tf` `schedule = "0 6 * * *"`), not
    midnight: a midnight-to-midnight window is still in the future at 06:00, so a cron-fired run
    would only ever see its 00:00-06:00 slice. Ending the window at 06:00 keeps it a pure
    function of `date` (idempotent replay, AD-4) while guaranteeing it has fully elapsed by the
    time any run — cron or replay — executes.
    """
    end = datetime.strptime(date, "%Y-%m-%d").replace(hour=6, tzinfo=PARIS_TZ)
    start = end - timedelta(days=1)
    return f"is:unread after:{int(start.timestamp())} before:{int(end.timestamp())}"


def _decode_body(payload: dict[str, Any]) -> str:
    """Concatenate decoded text/html (preferred) and text/plain parts of a Gmail payload."""
    html_parts: list[str] = []
    text_parts: list[str] = []

    def walk(part: dict[str, Any]) -> None:
        mime = part.get("mimeType", "")
        data = part.get("body", {}).get("data")
        if data:
            # Gmail returns base64url *without* padding; pad to a multiple of 4 or
            # urlsafe_b64decode raises binascii.Error: Incorrect padding.
            padded = data + "=" * (-len(data) % 4)
            decoded = base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
            if mime == "text/html":
                html_parts.append(decoded)
            elif mime == "text/plain":
                text_parts.append(decoded)
        for child in part.get("parts", []):
            walk(child)

    walk(payload)
    return "\n".join(html_parts or text_parts)


def _header(headers: list[dict[str, Any]], name: str) -> str:
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _parse_message(message: dict[str, Any]) -> Newsletter:
    payload = message.get("payload", {})
    headers = payload.get("headers", [])
    sender = _header(headers, "From")
    subject = _header(headers, "Subject")
    received_at = datetime.fromtimestamp(int(message["internalDate"]) / 1000, PARIS_TZ)
    body = _decode_body(payload)
    _, address = parseaddr(sender)
    sender_domain = address.split("@", 1)[1] if "@" in address else None
    return Newsletter(
        sender=sender,
        subject=subject,
        received_at=received_at,
        candidate_urls=extract_article_urls(body, sender_domain=sender_domain),
    )


class GmailReaderClient:
    """`GmailClient` implementation over the Gmail REST API.

    `service` may be injected (tests pass a fake Resource); otherwise it is built lazily from
    the refresh-token secret so importing this module needs no credentials.
    """

    def __init__(self, service: Any | None = None) -> None:
        self._service = service

    def _resource(self) -> Any:
        if self._service is None:
            self._service = build("gmail", "v1", credentials=_credentials(), cache_discovery=False)
        return self._service

    def fetch_unread(self, date: str) -> list[Newsletter]:
        service = self._resource()
        listing = (
            service.users()
            .messages()
            .list(userId="me", q=_window_query(date), maxResults=MAX_NEWSLETTERS)
            .execute()
        )
        refs = listing.get("messages", [])[:MAX_NEWSLETTERS]
        newsletters: list[Newsletter] = []
        for ref in refs:
            full = (
                service.users().messages().get(userId="me", id=ref["id"], format="full").execute()
            )
            newsletters.append(_parse_message(full))
        return newsletters
