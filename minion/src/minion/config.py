"""Static configuration constants for the Minion orchestrator.

Module-level constants only — no side effects, no I/O. The 20-minute run timeout is the
constitution §2.6 hard cap; F-003 does not enforce it in-process (that is the Cloud Run
Job `timeout` in F-007), but the stale-lock reclaim (AD-2) reuses it as a TTL.
"""

from __future__ import annotations

from datetime import timedelta
from zoneinfo import ZoneInfo

from veilleur_shared.run import StepName

# Wall-clock ceiling for a single run (constitution §2.6). Reused as the lock-staleness TTL.
RUN_TIMEOUT: timedelta = timedelta(minutes=20)

# All run timestamps and the daily date key are computed in this zone (PRD: Europe/Paris).
PARIS_TZ: ZoneInfo = ZoneInfo("Europe/Paris")

# Firestore collection / document layout (AD-1, AD-2).
RUNS_COLLECTION: str = "runs"  # runs/{date}, runs/{date}/steps/{stepName}
STEPS_SUBCOLLECTION: str = "steps"
LOCKS_COLLECTION: str = "locks"  # locks/{LOCK_DOC_ID}
LOCK_DOC_ID: str = "minion"  # single global lock (global single-flight)

# The nine canonical pipeline steps, in execution order (the StepName enum is declaration
# ordered to match the pipeline; constitution §2.9 observability is per this set).
STEP_ORDER: tuple[StepName, ...] = tuple(StepName)

# --- Ingestion (F-004) -------------------------------------------------------------------

# Secret holding the operator's Gmail OAuth refresh-token JSON (authorized_user.json shape).
GMAIL_REFRESH_TOKEN_SECRET: str = "gmail-oauth-refresh-token"

# Read-only Gmail access — the pipeline never marks messages read (F-004 AD-2, keeps replay
# idempotent and avoids the broader gmail.modify scope).
GMAIL_SCOPES: tuple[str, ...] = ("https://www.googleapis.com/auth/gmail.readonly",)

# Sender denylist (PRD §7). Empty for MVP, maintained manually. An entry matches a newsletter
# when it equals the full From address (case-insensitive) or is an "@domain" suffix of it.
EXCLUDED_SENDERS: frozenset[str] = frozenset()

# Per-run hard caps (PRD §3 Scalability). Truncation is logged, never silent.
MAX_NEWSLETTERS: int = 50
MAX_URLS: int = 100

# Jina Reader (PRD §5: free tier, no API key). Each candidate URL is GET-ed as
# `JINA_BASE_URL + url`.
JINA_BASE_URL: str = "https://r.jina.ai/"
JINA_TIMEOUT: timedelta = timedelta(seconds=30)  # per-request HTTP timeout
JINA_MAX_RETRIES: int = 2  # retries after the first attempt on 429 / transient errors
JINA_BACKOFF_BASE: timedelta = timedelta(seconds=1)  # exponential backoff unit
JINA_WORKERS: int = 6  # bounded concurrency for the scrape pool (AD-7)
# Overall scrape budget (PRD §4: ≤3 min target, 5 min ceiling).
JINA_DEADLINE: timedelta = timedelta(minutes=4)

# Substrings in Jina Reader output that signal paywalled content (FR-A3, AD-9). The exact
# markers are confirmed empirically and pinned by the jina-client tests.
PAYWALL_MARKERS: tuple[str, ...] = (
    "This content is for subscribers only",
    "Subscribe to read",
    "metered paywall",
)

# Input-validation threshold (PRD §6): continue only if ≥50% of candidates scraped OK AND
# ≥5 sources OK; otherwise the run hard-fails.
MIN_SOURCES_OK: int = 5
MIN_SOURCES_FRACTION: float = 0.5

# --- Generation / `/generate` (F-005) ----------------------------------------------------

# Secret holding the Claude Code OAuth token (`claude setup-token`). The generate subprocess
# authenticates via this; ANTHROPIC_API_KEY is stripped from its env (constitution §2.2).
ANTHROPIC_OAUTH_TOKEN_SECRET: str = "anthropic-oauth-token"

# The agentic invocation (promoted from spike/claude_probe). `/generate` ships in the pinned
# allienna/claude-feature-flow plugin installed in the Minion image (constitution §3, F-007).
CLAUDE_CMD: tuple[str, ...] = (
    "claude",
    "-p",
    "/generate",
    "--permission-mode",
    "bypassPermissions",
)
CLAUDE_TIMEOUT: timedelta = timedelta(minutes=8)  # PRD §4: ≤4 min target, 8 min ceiling
CLAUDE_BACKOFF_BASE: timedelta = timedelta(seconds=2)  # transport-retry backoff unit
CLAUDE_TRANSPORT_RETRIES: int = (
    2  # retries on a Claude transport error (PRD §6), distinct from validation retries
)

# Per-run caps (PRD §3 Scalability). Token budgets use a char heuristic (AD-10/AD-12), not a
# real tokenizer — a guard, not an exact bound.
MAX_GENERATE_INPUT_TOKENS: int = 500_000
MAX_GENERATE_OUTPUT_TOKENS: int = 30_000
MAX_ARTICLE_WORDS: int = 10_000
MAX_LINKEDIN_CHARS: int = 3000
MAX_IMAGE_PROMPT_CHARS: int = 1000

# Astro article frontmatter — required field set and the theme allowlist. Source of truth is
# the external allienna/veilleur content-collection schema (AD-5); reconcile in burn-in (F-013).
REQUIRED_FRONTMATTER_FIELDS: tuple[str, ...] = ("title", "date", "description", "tags")
THEME_ALLOWLIST: frozenset[str] = frozenset(
    {"ai", "cloud", "devops", "web", "data", "security", "mobile", "other"}
)
DEFAULT_THEME: str = "other"  # unknown theme normalizes here (PRD §6 — not an error)

# Copyright post-validator (constitution §4 / FR-A3).
MAX_QUOTE_WORDS: int = 30  # max words in a single direct quote per source
MAX_QUOTES_PER_SOURCE: int = 1  # max distinct quotes attributable to one source
WHOLESALE_NGRAM: int = 12  # ≥ this many consecutive shared tokens ⇒ wholesale reproduction

# Agentic validation-retry budget (PRD §6): re-invoke `/generate` with errors fed back.
MAX_GENERATE_RETRIES: int = 2
