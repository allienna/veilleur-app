"""Real ingestion steps (F-004): `gmail`, `jina`, `validate_input`.

These replace the F-003 stub bodies for the first three pipeline slots; the remaining six
steps stay stubs (F-005/F-006). Each step depends only on an injected client Protocol
(`GmailClient` / `JinaClient`) so the pipeline runs hermetically under fakes (AD-1/AD-5).

Data bag contract between the steps:
- `gmail`          → writes `newsletters: list[Newsletter]`, `candidate_urls: list[str]`
- `jina`           → reads `candidate_urls`, writes `sources: SourceSet`
- `validate_input` → reads `newsletters` + `sources`, gates the run (FR-4)
"""

from __future__ import annotations

from dataclasses import dataclass
from email.utils import parseaddr
from typing import cast

from minion import config
from minion.ingest.models import SourceSet
from minion.ingest.ports import GmailClient, JinaClient
from minion.models import RunStatus, StepName
from minion.steps.base import StepContext, StepResult


class InsufficientSourcesError(RuntimeError):
    """Raised by `validate_input` when too few sources scraped OK to publish (FR-4)."""


def _sender_address(sender: str) -> str:
    """Lowercased email address parsed from a raw `From` header value."""
    _, address = parseaddr(sender)
    return address.lower()


def _is_denied(sender: str, denylist: frozenset[str]) -> bool:
    """True if `sender` matches the denylist by full address or `@domain` suffix (AD-10)."""
    address = _sender_address(sender)
    if not address:
        return False
    for raw in denylist:
        entry = raw.lower()
        if entry.startswith("@"):
            if address.endswith(entry):
                return True
        elif address == entry:
            return True
    return False


@dataclass
class GmailStep:
    """Step 1: fetch unread newsletters, apply the denylist, extract+dedupe+cap article URLs."""

    client: GmailClient
    name: StepName = StepName.gmail

    def run(self, ctx: StepContext) -> StepResult:
        newsletters = self.client.fetch_unread(ctx.date)
        kept = [n for n in newsletters if not _is_denied(n.sender, config.EXCLUDED_SENDERS)]

        seen: set[str] = set()
        urls: list[str] = []
        for newsletter in kept:
            for url in newsletter.candidate_urls:
                if url not in seen:
                    seen.add(url)
                    urls.append(url)

        total = len(urls)
        if total > config.MAX_URLS:
            ctx.log.info("url cap reached", extra={"total": total, "capped_to": config.MAX_URLS})
            urls = urls[: config.MAX_URLS]

        ctx.log.info(
            "gmail fetched",
            extra={"fetched": len(newsletters), "kept": len(kept), "urls": len(urls)},
        )
        payload: dict[str, object] = {"newsletters": kept, "candidate_urls": urls}
        return StepResult(payload=payload)


@dataclass
class JinaStep:
    """Step 2: scrape the candidate URLs to clean Markdown, preserving per-source outcomes."""

    client: JinaClient
    name: StepName = StepName.jina

    def run(self, ctx: StepContext) -> StepResult:
        urls = cast("list[str]", ctx.data.get("candidate_urls", []))
        sources = SourceSet(sources=self.client.scrape(urls))
        ctx.log.info(
            "jina scraped",
            extra={
                "ok": sources.ok_count,
                "paywalled": sources.paywalled_count,
                "failed": sources.failed_count,
                "total": sources.total,
            },
        )
        return StepResult(payload={"sources": sources})


@dataclass
class ValidateInputStep:
    """Step 3: the quality gate. Skip an empty mailbox; gate on the ≥50%-AND-≥5 threshold."""

    name: StepName = StepName.validate_input

    def run(self, ctx: StepContext) -> StepResult:
        sources = cast("SourceSet", ctx.data.get("sources") or SourceSet(sources=[]))

        if sources.total == 0:
            # Empty mailbox / no usable URLs → graceful skip, not a failure (FR-4, AD-3).
            ctx.log.info("no sources; skipping run", extra={"reason": "no_sources"})
            return StepResult(terminal_status=RunStatus.skipped, reason="no_sources")

        ok, total = sources.ok_count, sources.total
        fraction = ok / total
        if ok < config.MIN_SOURCES_OK or fraction < config.MIN_SOURCES_FRACTION:
            # Include the paywalled/failed split so a thin-news day (mostly paywalled) is
            # distinguishable from scrape trouble (mostly failed — e.g. Jina rate-limiting).
            raise InsufficientSourcesError(
                f"insufficient_sources: {ok}/{total} ok "
                f"({sources.paywalled_count} paywalled, {sources.failed_count} failed; "
                f"need ≥{config.MIN_SOURCES_OK} and ≥{config.MIN_SOURCES_FRACTION:.0%})"
            )

        ctx.log.info(
            "input validated",
            extra={
                "ok": ok,
                "paywalled": sources.paywalled_count,
                "failed": sources.failed_count,
                "total": total,
            },
        )
        return StepResult()
