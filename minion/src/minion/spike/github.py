"""GitHub Contents API committer for the Hello-Veilleur spike.

Commits one WebP image to a GitHub repo at `site/public/images/spikes/{date}.webp`.
Idempotent by date — replaying for the same date overwrites prior content via the GH
API's update-with-sha pattern. Returns the resulting commit SHA.

MIGRATION-PHASE TARGET (2026-05-26): writes to `allienna/veilleur-app` (this monorepo)
instead of the real public-site repo, to avoid polluting the live v1 site while v2 is
being built. The eventual target is `allienna/veilleur` (served at the
allienna.github.io/veilleur project-page URL) — switching back is a one-word change to
`REPO_NAME`. PRD §8 mislabeled that repo as `allienna.github.io`; it does not exist.

Uses `httpx` directly against the Contents API rather than `PyGithub` (AD-6): the surface
is one PUT + one GET, the dep tree stays small, and `httpx` is reused in F-004 for Jina.
"""

from __future__ import annotations

import base64
from typing import Any

import httpx

from minion.spike.secrets import require

REPO_OWNER = "allienna"
REPO_NAME = "veilleur-app"  # migration-phase override; eventual target is "veilleur"
BRANCH = "main"
PATH_TEMPLATE = "site/public/images/spikes/{date}.webp"
API_BASE = "https://api.github.com"

_TIMEOUT = httpx.Timeout(30.0)


def _headers() -> dict[str, str]:
    pat = require("github-pat-allienna-pages")
    return {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _get_existing_sha(path: str, headers: dict[str, str]) -> str | None:
    url = f"{API_BASE}/repos/{REPO_OWNER}/{REPO_NAME}/contents/{path}"
    response = httpx.get(url, headers=headers, params={"ref": BRANCH}, timeout=_TIMEOUT)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    body: dict[str, Any] = response.json()
    sha = body.get("sha")
    return str(sha) if isinstance(sha, str) else None


def commit_image(date: str, content: bytes) -> str:
    """Commit WebP `content` to the date-stamped path on `{REPO_OWNER}/{REPO_NAME}@{BRANCH}`.

    During migration that is `allienna/veilleur-app@main`. Returns the new commit SHA;
    raises on any non-2xx response from GitHub.
    """
    headers = _headers()
    path = PATH_TEMPLATE.format(date=date)
    existing_sha = _get_existing_sha(path, headers)

    payload: dict[str, Any] = {
        "message": f"chore(spike): image probe {date}",
        "content": base64.b64encode(content).decode("ascii"),
        "branch": BRANCH,
    }
    if existing_sha is not None:
        payload["sha"] = existing_sha

    url = f"{API_BASE}/repos/{REPO_OWNER}/{REPO_NAME}/contents/{path}"
    response = httpx.put(url, headers=headers, json=payload, timeout=_TIMEOUT)
    response.raise_for_status()
    body: dict[str, Any] = response.json()
    commit_obj = body.get("commit") if isinstance(body, dict) else None
    sha = commit_obj.get("sha") if isinstance(commit_obj, dict) else None
    if not isinstance(sha, str):
        msg = f"GitHub Contents API response missing commit.sha: {body!r}"
        raise RuntimeError(msg)
    return sha
