"""Gmail unread-count probe for the Hello-Veilleur spike.

Returns the count of unread messages received in the last 24h on the operator's inbox.
No body fetch — pure auth + count probe to exercise the Gmail OAuth chain.
"""

from __future__ import annotations

import json
from typing import Any, cast

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from minion.spike.secrets import require

_GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
_DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _credentials() -> Credentials:
    """Build short-lived Gmail credentials from the operator's refresh-token JSON in Secret Manager.

    Expected payload shape (canonical Google `authorized_user.json`, fields beyond these are
    ignored): `{refresh_token, client_id, client_secret, token_uri?}`.
    """
    payload = require("gmail-oauth-refresh-token")
    info: dict[str, Any] = json.loads(payload)
    return Credentials(
        token=None,
        refresh_token=info["refresh_token"],
        client_id=info["client_id"],
        client_secret=info["client_secret"],
        token_uri=info.get("token_uri", _DEFAULT_TOKEN_URI),
        scopes=_GMAIL_SCOPES,
    )


def count_unread_last_24h() -> int:
    """Return the count of unread Gmail messages received in the last 24h.

    Calls `users.messages.list` with `q="is:unread newer_than:1d"`, `maxResults=1`, and
    `fields="resultSizeEstimate"` — no message bodies are fetched. Returns the size estimate.
    """
    creds = _credentials()
    # googleapiclient builds its Resource chain dynamically; pyright can't follow the calls,
    # so we opt out of strict typing for the chain and re-assert the return type.
    service = cast(Any, build("gmail", "v1", credentials=creds, cache_discovery=False))
    response: dict[str, Any] = (
        service.users()
        .messages()
        .list(
            userId="me",
            q="is:unread newer_than:1d",
            maxResults=1,
            fields="resultSizeEstimate",
        )
        .execute()
    )
    return int(response.get("resultSizeEstimate", 0))
