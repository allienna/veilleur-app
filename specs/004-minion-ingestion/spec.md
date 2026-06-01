# Spec: Minion ingestion (Gmail + Jina)

**Track ID**: 004-minion-ingestion
**Roadmap ref**: F-004
**Status**: In Progress
**Created**: 2026-06-01
**Branch**: feat/004-minion-ingestion
**PRD sections**: FR-A2 (steps 1–3), FR-A3 (paywall exclusion), §3 Scalability caps, §4 Performance (ingestion budget), §6 Failure-Mode Policies, §7 Sender denylist, §5 Integrations (Gmail, Jina)
**Depends on**: F-003 — Minion orchestrator core (**Complete**, merged #7); F-001 spike — Gmail OAuth chain (**Complete**, merged #5)

## Context

The Minion's daily run begins with three ingestion steps: **Gmail pull → Jina scrape →
input validation**. F-003 wired these as stubs (`gmail` → `{"newsletters": []}`, `jina` →
`{"articles": []}`, `validate_input` → `{"valid": True, "sources": 0}`) against a state
machine that already enforces run lifecycle, Firestore observability, concurrency, and
idempotency. F-004 replaces those three stub bodies with **real implementations** and leaves
the remaining six steps (`assemble`, `generate`, `validate_output`, `imagen`, `github`,
`publish`) as stubs for F-005/F-006.

After F-004, the first half of the daily run reaches "context assembly" carrying **real
upstream data**: unread newsletters fetched from the operator's Gmail over a 24h window,
their article links scraped to clean Markdown via Jina Reader, and a validated source set
that either passes the quality gate or terminates the run early.

The Gmail OAuth chain is already proven: the F-001 spike's `minion/src/minion/spike/gmail.py`
authenticates with the `gmail-oauth-refresh-token` secret under the `gmail.readonly` scope
and queries `users.messages.list`. F-004 promotes that pattern from a count-only probe to a
real body-fetching, URL-extracting ingestion step in `minion/src/minion/steps/`.

This feature also surfaces a **state-machine gap**: F-003's orchestrator has only
`success`/`failure` terminal paths (a step either returns or raises). But PRD §6 requires an
empty mailbox to end the run as `skipped: no_sources` — a *graceful* early-exit that halts
the remaining steps **without** being a failure and **without** a push notification. F-004
must extend the step contract / orchestrator to support this third terminal path.

## User Stories

- As the **operator**, I want the pipeline to ingest my unread newsletters from the dedicated
  Gmail inbox over the last 24h so that no manual mailbox triage is needed.
- As the **operator**, I want each linked article scraped via Jina Reader to clean Markdown so
  that source extraction is deterministic and paywall-aware.
- As the **operator**, I want a day with no newsletters to end cleanly as `skipped` (no
  article, no error, no notification noise) rather than as a failure.
- As the **operator**, I want a run to keep going when most sources scrape successfully, but
  hard-fail when too few do, so a half-empty digest is never published.
- As the **operator**, I want to mute specific senders via a denylist so promotional or noisy
  newsletters never reach the pipeline.
- As a **developer**, I want every ingestion boundary (fetched newsletter, scraped source,
  validated source set) to flow through a Pydantic model so malformed upstream data fails
  loudly at the boundary.
- As a **developer**, I want all ingestion unit tests to run against mocked Gmail and Jina (no
  live network) so the `build-minion` CI job stays hermetic and fast.

## Functional Requirements

### FR-1: Real `gmail` step — fetch unread newsletters (24h window)
Replace the `gmail` stub with a real step that:
- Builds Gmail credentials from the `gmail-oauth-refresh-token` secret using the
  `gmail.readonly` scope (reusing the proven F-001 spike pattern; promote it out of `spike/`).
- Lists **unread** messages received in a **24h window** (PRD FR-A2 / §2 user story). The
  window is anchored to the run `date` for replayable idempotency (see Open Questions on
  anchor-to-date vs anchor-to-now).
- Fetches each matching message and extracts sender + body for URL extraction (FR-2).
- Applies the sender **denylist** (FR-5).
- Caps the result at **50 newsletters** (§3 scalability cap); logs when the cap truncates.
- Returns a structured, schema-shaped list of newsletters (sender, subject, received-at,
  extracted candidate URLs) into the run data bag.
- Read-only: F-004 does **not** mark messages read (that would break date-keyed replay and
  requires a broader OAuth scope — see Out of Scope / Open Questions).

### FR-2: Article-URL extraction from newsletter bodies
From the fetched newsletter bodies, extract candidate **article URLs**:
- Parse HTML/text bodies, collect outbound links.
- Filter out non-article links (unsubscribe, tracking pixels, social, mailto, the sender's own
  domain footer) — heuristic to be finalized in `/plan` (see Open Questions).
- **Deduplicate** URLs across all newsletters.
- Cap the deduplicated set at **100 URLs** (§3 Jina scrape cap); log when truncated.
- The output of the `gmail` step is the newsletters + this de-duplicated, capped URL list that
  the `jina` step consumes.

### FR-3: Real `jina` step — scrape sources via Jina Reader
Replace the `jina` stub with a real step that, for each candidate URL:
- Issues an HTTPS GET to `https://r.jina.ai/<url>` (Jina Reader free tier, **no API key** —
  PRD §5) and receives clean Markdown.
- Handles Jina **rate-limiting / transient failures** with retry + backoff; a URL that
  ultimately fails is recorded as a *failed source* but does **not** crash the step (the
  ≥50%/≥5 gate in FR-4 decides the run's fate). Concurrency/sequencing strategy decided in
  `/plan` (see Open Questions).
- Detects **paywalled** content via Jina Reader output markers (FR-A3) and excludes those
  sources from the "OK" set.
- Returns a structured list of scraped sources (url, resolved title, Markdown content,
  `ok`/`paywalled`/`failed` outcome) into the run data bag.
- Soft-respects the ingestion **time budget** (≤3 min target, 5 min ceiling — §4); hard
  enforcement remains the Cloud Run Job timeout (F-007).

### FR-4: Real `validate_input` step — quality gate + early-exit
Replace the `validate_input` stub with the boundary gate:
- **No-sources case**: if there are zero newsletters or zero candidate URLs, the run ends as
  **`skipped`** with reason `no_sources` — remaining steps are halted, the run is **not** a
  failure, and (per §6 / F-012) no push notification will be sent. Visible in run history.
- **Threshold case**: the run **continues** only if **≥50% of candidate sources scraped OK
  AND ≥5 sources OK** (PRD §6). Otherwise the run **hard-fails** with a clear error naming the
  shortfall (e.g. `insufficient_sources: 3/12 ok`).
- Schema-validates the assembled source set at the boundary (Pydantic), so malformed data
  cannot reach `assemble`.
- On pass, hands the validated source set forward in the data bag for the (still-stubbed)
  `assemble` step.

### FR-5: Sender denylist (PRD §7)
- Introduce `EXCLUDED_SENDERS` in `minion/src/minion/config.py` (referenced by PRD §7),
  **empty for MVP**, maintained manually.
- The `gmail` step filters out any newsletter whose sender matches the denylist before URL
  extraction. Match granularity (exact address vs domain suffix, case handling) decided in
  `/plan` (see Open Questions).

### FR-6: Graceful early-exit terminal path (orchestrator extension)
F-003's state machine knows only `success` and `failure`. F-004 extends the step contract /
orchestrator so a step can signal **graceful early termination**: halt the remaining steps,
finalize the run with a non-failure terminal status (`skipped`, reason `no_sources`), and
release the lock. The extension must preserve all F-003 invariants (idempotent replay,
concurrency guard, per-step observability) and remain generic enough for future skip reasons.
The skipped step itself and the run document record the reason for PWA supervision.

### FR-7: Pydantic boundaries for ingestion data
Every ingestion I/O boundary is a Pydantic model: the fetched newsletter, the candidate-URL
list, the scraped source, and the validated source set. These are **Minion-internal** pipeline
models (carried in the run data bag), not part of the PWA-facing shared schema — *unless*
`validate_input` writes a source count/summary onto the run or step document for supervision,
in which case the shared schema is extended and regenerated via `pnpm gen` (decide scope in
`/plan` — see Open Questions). No raw dicts cross a step boundary.

## API Endpoints Involved

| Source API | Method | Path | Purpose |
|------------|--------|------|---------|
| Gmail API | GET | `users.messages.list` (`q="is:unread newer_than:1d"`) | Enumerate unread newsletters in the 24h window. |
| Gmail API | GET | `users.messages.get` | Fetch message sender + body for URL extraction. |
| Jina Reader | GET | `https://r.jina.ai/<url>` | Scrape each candidate article URL to clean Markdown (free tier, no key). |
| Cloud Firestore | write | `runs/{date}/steps/{gmail,jina,validate_input}` | Per-step observable state (lifecycle from F-003; F-004 fills real timings/errors). |

Gmail auth uses the `gmail-oauth-refresh-token` secret (Secret Manager) via
`google-api-python-client`, `gmail.readonly` scope — the chain proven in the F-001 spike.

## Error Scenarios

| Scenario | Expected handling (PRD §6) |
|----------|----------------------------|
| Mailbox empty (no newsletter in 24h) | Run ends `skipped` (`no_sources`). No article, no push notif, remaining steps halted. Visible in history. **Not** a failure. |
| Gmail auth expired / refresh fails | Hard fail: `gmail` step → `failure`, run → `failure`, clear error. (Re-auth runbook link is F-013; push-on-fail is F-012.) |
| Jina rate-limit on a URL | Retry with backoff; if it still fails, mark that source `failed` and continue — the FR-4 gate decides. |
| Single source down / 4xx-5xx | Recorded as a failed source; does not crash the `jina` step. |
| Too few sources scraped | Continue only if ≥50% OK **AND** ≥5 OK; otherwise `validate_input` → run `failure` (`insufficient_sources`). |
| Paywalled source | Excluded from the OK set (FR-A3); counts as not-OK for the threshold. |
| Newsletter/source fails schema validation | Fail loudly at the Pydantic boundary in the owning step; surfaced in the step error. |
| >50 newsletters / >100 URLs | Truncate to the cap; log the truncation (constitution §2 caps). |

## Acceptance Criteria

- [ ] AC-1: The real `gmail` step fetches unread messages in the 24h window (mocked Gmail in
      tests), applies `EXCLUDED_SENDERS`, caps at 50 newsletters, and returns structured
      newsletters with extracted candidate URLs.
- [ ] AC-2: Candidate URLs are deduplicated across newsletters and capped at 100; truncation
      is logged.
- [ ] AC-3: The real `jina` step scrapes each URL via `https://r.jina.ai/<url>` (mocked in
      tests) and returns clean Markdown per source with a per-source `ok`/`paywalled`/`failed`
      outcome.
- [ ] AC-4: Paywalled sources (detected via Jina output markers) are excluded from the OK set.
- [ ] AC-5: `validate_input` lets the run continue when ≥50% scraped OK **and** ≥5 OK; below
      either bound the run hard-fails with an error naming the shortfall.
- [ ] AC-6: A run with zero newsletters or zero URLs ends `skipped` with reason `no_sources`,
      halts the remaining steps, and is recorded as a non-failure in the run document.
- [ ] AC-7: A Gmail auth/refresh failure marks the `gmail` step and the run `failure` with a
      clear error message.
- [ ] AC-8: Jina rate-limit / transient errors are retried with backoff; a source that
      ultimately fails is counted as not-OK without crashing the `jina` step.
- [ ] AC-9: All ingestion boundary values flow through Pydantic models; if the shared schema is
      extended, `pnpm check:codegen` passes (committed output not drifted).
- [ ] AC-10: `uv run ruff check . && uv run ruff format --check . && uv run pyright &&
      uv run pytest` all pass. Tests (mocked Gmail + Jina, no live network) cover: happy path,
      threshold-pass (degraded but ≥50%/≥5), threshold-fail, empty-mailbox skip, paywall
      exclusion, and denylist filtering.

## Out of Scope

- Real implementations of `assemble`, `generate`, `validate_output`, `imagen`, `github`,
  `publish` — F-005 (`/generate`, copyright post-validator) and F-006 (Imagen + GitHub).
- Context assembly and the `/generate` input-token budget (500k) — F-005.
- Marking fetched emails as read / `gmail.modify` scope (would break date-keyed replay).
- Re-auth runbook documentation and the auth-expiry PWA banner — F-013 / PWA tracks.
- Push notification on failure / suppression on `skipped` — F-012 (the `publish` stub only).
- Cloud Run Job timeout enforcement of the ≤3 min ingestion budget — F-007 (recorded only here).
- LLM cost / token accounting — lands with the agentic steps (F-005).

## Open Questions

1. **24h window anchor.** Anchor the unread window to the run `date` (deterministic,
   replayable: `after:<date-1d> before:<date+1d>`) vs `newer_than:1d` relative to `now()`
   (simpler, but a replay later in the day sees a different mailbox). Recommendation: anchor to
   the run `date` for true idempotency. Decide in `/plan`.
2. **URL extraction heuristic.** How to distinguish article links from unsubscribe/tracking/
   social/footer links — allowlist of "looks like an article" vs denylist of known
   tracking/CDN/unsubscribe patterns, and whether to follow one redirect hop. Decide in `/plan`.
3. **Jina request strategy.** Sequential-with-backoff vs bounded concurrency (e.g. 5 at a
   time), and the retry/backoff parameters — constrained by the unknown free-tier rate limit
   and the ≤3 min/5 min ingestion budget. Decide in `/plan`.
4. **Paywall markers.** The exact Jina Reader output marker(s) signalling paywalled content
   need empirical confirmation against a real paywalled URL (the F-001 image-probe approach).
   Decide in `/plan`; capture the observed marker in a fixture.
5. **Denylist match granularity.** `EXCLUDED_SENDERS` matched on exact `From` address vs domain
   suffix, case-insensitive. Recommendation: support both forms (full address and `@domain`),
   case-insensitive. Decide in `/plan`.
6. **Early-exit mechanism (FR-6).** How a step signals graceful skip: a dedicated
   `StepResult` field (e.g. `terminal_status` / `skip_reason`) vs a typed control exception
   caught by the orchestrator. Recommendation: a `StepResult` signal (exceptions already mean
   failure). Decide in `/plan` — it touches `steps/base.py` and `orchestrator.py`.
7. **Shared-schema extension (FR-7).** Whether `validate_input` writes a source-count/summary
   onto the run or step document (PWA supervision benefit, requires extending `run.json` +
   `pnpm gen`) or keeps ingestion data purely Minion-internal. Recommendation: keep newsletter/
   source shapes internal; add at most a small `sources` count to the step record if cheap.
   Decide in `/plan`.
8. **Test doubles for Gmail/Jina.** Mock the `googleapiclient` Resource chain and the Jina HTTP
   client directly vs introduce thin ports (like the F-003 `RunStore`/`LockStore`) for Gmail +
   Jina. Recommendation: thin ports for testability and to match the F-003 store pattern.
   Decide in `/plan`.
