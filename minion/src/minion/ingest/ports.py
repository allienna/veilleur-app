"""Ingestion ports — the only Gmail/scrape surface the ingestion steps know about (F-004 AD-1).

Mirrors `store/ports.py`: the steps depend on these Protocols, the production clients
(`gmail.py`, `scraper.py`) implement them, and `fakes.py` provides hermetic test doubles so
the whole pipeline can run without network access.
"""

from __future__ import annotations

from typing import Protocol

from minion.ingest.models import Newsletter, ScrapedSource


class GmailClient(Protocol):
    """Fetches unread newsletters from the operator's Gmail inbox."""

    def fetch_unread(self, date: str) -> list[Newsletter]:
        """Return unread newsletters received in the 24h window anchored to `date`
        (YYYY-MM-DD, Europe/Paris — F-004 AD-4). Raises on auth/refresh failure (hard fail)."""
        ...


class ScraperClient(Protocol):
    """Scrapes candidate URLs to clean Markdown (local extraction — F-015)."""

    def scrape(self, urls: list[str]) -> list[ScrapedSource]:
        """Scrape each URL, returning one `ScrapedSource` per input with an `ok` / `paywalled`
        / `failed` outcome. A URL that fails after retries is reported `failed`; this method
        never raises for a single bad source (PRD §6 — the validation gate decides the run)."""
        ...
