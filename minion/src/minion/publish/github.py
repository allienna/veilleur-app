# pyright: basic
# ^ wraps the GitHub Contents API (untyped JSON over httpx); like store/firestore.py and
#   generate/runner.py this external-boundary adapter is dropped to basic checking. Behaviour is
#   covered by FakeContentRepository + the gated integration test (no GitHub/network in CI).
"""Production `ContentRepository` over the GitHub Contents API (F-006, promotes spike/github.py).

One PUT (create-or-update) plus a GET to fetch the existing blob SHA — idempotent by path, so a
replay overwrites prior content (constitution §2.7). Uses `httpx` directly (the surface is tiny
and `httpx` is already used for Jina). Retry/backoff lives in `GithubStep` (plan AD-2); this
adapter raises `ContentRepoError` on any non-2xx or transport failure.

Target repo is configured in `config` — currently the migration-phase `allienna/veilleur-app`
(plan AD-5 / Open Q#2), a one-constant switch to `allienna/veilleur` later.
"""

from __future__ import annotations

import base64
from typing import Any

import httpx

from minion import config, secrets
from minion.publish.ports import ContentRepoError

_API_BASE = "https://api.github.com"


class GitHubContentRepository:
    """Commits single files to `{owner}/{repo}@{branch}` via the Contents API."""

    def __init__(self) -> None:
        self._timeout = httpx.Timeout(config.GITHUB_TIMEOUT.total_seconds())

    def _headers(self) -> dict[str, str]:
        pat = secrets.require(config.GITHUB_PAT_SECRET)
        return {
            "Authorization": f"Bearer {pat}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def _contents_url(self, path: str) -> str:
        return (
            f"{_API_BASE}/repos/{config.GITHUB_REPO_OWNER}/{config.GITHUB_REPO_NAME}"
            f"/contents/{path}"
        )

    def _existing_sha(self, path: str, headers: dict[str, str]) -> str | None:
        try:
            response = httpx.get(
                self._contents_url(path),
                headers=headers,
                params={"ref": config.GITHUB_BRANCH},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise ContentRepoError(f"GitHub GET {path} failed: {exc}") from exc
        if response.status_code == httpx.codes.NOT_FOUND:
            return None
        if response.is_error:
            raise ContentRepoError(f"GitHub GET {path} returned {response.status_code}")
        body: dict[str, Any] = response.json()
        sha = body.get("sha")
        return sha if isinstance(sha, str) else None

    def put_file(self, path: str, content: bytes, message: str) -> str:
        headers = self._headers()
        existing_sha = self._existing_sha(path, headers)
        payload: dict[str, Any] = {
            "message": message,
            "content": base64.b64encode(content).decode("ascii"),
            "branch": config.GITHUB_BRANCH,
        }
        if existing_sha is not None:  # update-with-sha → idempotent overwrite
            payload["sha"] = existing_sha
        try:
            response = httpx.put(
                self._contents_url(path), headers=headers, json=payload, timeout=self._timeout
            )
        except httpx.HTTPError as exc:
            raise ContentRepoError(f"GitHub PUT {path} failed: {exc}") from exc
        if response.is_error:
            raise ContentRepoError(
                f"GitHub PUT {path} returned {response.status_code}: {response.text[:300]}"
            )
        body: dict[str, Any] = response.json()
        commit = body.get("commit") if isinstance(body, dict) else None
        sha = commit.get("sha") if isinstance(commit, dict) else None
        if not isinstance(sha, str):
            raise ContentRepoError(f"GitHub PUT {path} response missing commit.sha")
        return sha
