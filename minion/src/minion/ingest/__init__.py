"""Ingestion subpackage (F-004): real Gmail + Jina steps and their supporting models.

Mirrors the `store/` layout — `ports.py` declares the `GmailClient` / `JinaClient` Protocols
the steps depend on, `gmail.py` / `jina.py` are the production implementations, `fakes.py`
holds hermetic test doubles, `models.py` the Minion-internal Pydantic boundary models, and
`extract.py` the pure URL-extraction helpers. None of these cross the PWA-facing shared
schema — they are intermediate pipeline values carried in the orchestrator data bag (F-004
AD-6).
"""

from __future__ import annotations
