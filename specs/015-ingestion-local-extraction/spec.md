# Spec: Ingestion resilience — local content extraction

**Track ID**: 015-ingestion-local-extraction
**Roadmap ref**: F-015
**Status**: Draft
**Created**: 2026-06-04
**Branch**: feat/015-ingestion-local-extraction
**PRD sections**: §5 Tech Choices (2026-06-04 scraping amendment), §6 scrape-failure policy, FR-A2 step 2, FR-A3 (paywall/copyright)
**Depends on**: F-004 Minion ingestion (Complete — merged; this track supersedes its scraper). Surfaced by F-013 burn-in.

## Context

F-013 burn-in falsified PRD §5's original scraping choice (Jina Reader free tier, no key). The first production runs hard-failed the ingestion quality gate (≥50% scraped AND ≥5 OK) at **17/46** then **1/31** sources OK. The instrumentation added mid-burn-in (PR #19) showed **0 paywalled, all failures HTTP-level** — the free-tier rate-limit signature, not a thin-news day. A single run of up to 100 URLs across a bounded worker pool bursts past Jina's free per-minute limit, so *every* production run fails the gate. Burn-in is blocked and the talk's "runs daily in production" claim is unmet.

Scraping is rated **Flexible** in `specs/constitution.md`, so the engine is swappable without violating a principle. This track replaces the external Jina Reader with **in-container local extraction** (`httpx` fetch + `trafilatura`): no external service, no key, no quota, no rate limit. The ingestion state machine, the Gmail step, the `ok/paywalled/failed` outcome taxonomy, and the ≥50%/≥5 validation gate are all unchanged — only the scrape engine behind the existing port is replaced.

## User Stories

- As the operator, I want article URLs scraped to clean Markdown by an in-container extractor so that a daily run never fails on a third-party scraper's rate limit.
- As the operator, I want paywalled and unfetchable sources still classified correctly (`paywalled` / `failed`) so that the copyright exclusion (FR-A3) and the quality gate keep working unchanged.
- As the speaker, I want the scraper swap to live in its own versioned track (spec → plan → tasks → review) so that the repo shows the methodology reacting to production evidence — the talk thesis in action.
- As a maintainer, I want the scrape port named for what it is (`ScraperClient`, not `JinaClient`) so that the code stays coherent with the shipped reality (FR-5/FR-G1).

## Functional Requirements

### FR-1: Local extraction client implementing the scrape port
A new client fetches each candidate URL with `httpx` and extracts main content with `trafilatura`, returning one `ScrapedSource` per input URL with an `ok` / `paywalled` / `failed` outcome (the existing `minion/src/minion/ingest/models.py` taxonomy). On `ok` it carries the cleaned Markdown + title. It implements the existing scrape Protocol so the `JinaStep` and the rest of the pipeline are untouched. It never raises for a single bad source (PRD §6 — the gate decides the run).

### FR-2: Browser-like, resilient fetch
Fetch with a realistic User-Agent, redirect-following, gzip, and a per-URL timeout — many article sites reject a bare client (403). Retry on transient errors (timeout / connection / 5xx). Honor an overall scrape deadline and a bounded worker pool (politeness is now per-origin, since there is no central limit). Non-HTML, empty extraction, JS-only/SPA pages, and bot-blocks resolve to `failed`.

### FR-3: Paywall detection recalibrated for raw-HTML extraction
The current `PAYWALL_MARKERS` were tuned to *Jina's* output and pinned by the jina-client tests. Local extraction sees different signals (truncated body, on-page paywall notices). Recalibrate the markers against real raw-HTML/extracted text so paywalled sources are still detected and excluded (constitution §4 / FR-A3). Document how the markers were chosen (mirroring the original "confirmed empirically" note).

### FR-4: Rename the port and module for coherence (FR-5/FR-G1)
Rename the `JinaClient` Protocol → `ScraperClient` and `minion/src/minion/ingest/jina.py` → an engine-neutral module (e.g. `scraper.py`), updating all references (steps, fakes, cli, tests) and the `JINA_*` config constants → `SCRAPE_*`. Update the constitution module-shape example (`jina.py` → the new name) and PRD's remaining historical references as appropriate. The old Jina client is removed (not kept) — local extraction fully replaces it.

### FR-5: Wire the new client and add the dependency
`trafilatura` added to `minion/pyproject.toml` (+ `uv.lock`). `cli.build_clients` constructs the new extractor in place of `JinaReaderClient`. CI (`build-minion`) stays green.

## API Endpoints Involved

| Source | Method | Path | Purpose |
|---|---|---|---|
| Article origin servers | GET | `<source url>` | Fetch raw HTML directly (browser-like headers), then extract locally. No third-party scraping service. |

## Error Scenarios

Reference PRD §6 failure-mode policies (as amended 2026-06-04):
- **Mass fetch failure** (bot-blocking, JS-only sites, timeouts): sources resolve to `failed`; the ≥50%/≥5 gate hard-fails the run if too few `ok`. This is the same gate as before, now guarding fetch failure rather than central throttling.
- **Empty/garbage extraction**: `trafilatura` returns nothing usable → `failed`, never a malformed `ok` source.
- **Genuinely thin-news day** (mostly `paywalled`): legitimate hard-fail; distinguishable from scrape trouble via the #19 ok/paywalled/failed logging.
- **Local yield proves too low in burn-in**: the `ScraperClient` port stays open for a documented hosted-reader fallback (the Hybrid option) — out of scope to build here, but the abstraction must not foreclose it.
- A single source must never raise out of the step (PRD §6).

## Acceptance Criteria

- [ ] AC-1: A new `ScraperClient` implementation fetches via `httpx` + extracts via `trafilatura`, returning one `ScrapedSource` (`ok`/`paywalled`/`failed`) per input URL, with Markdown + title on `ok`.
- [ ] AC-2: Fetch sets a browser-like UA, follows redirects, applies a per-URL timeout, and retries transient errors; non-HTML / empty / JS-only / blocked → `failed`. Verified with `httpx.MockTransport` fixtures.
- [ ] AC-3: Paywall markers recalibrated for raw-HTML extraction; a paywalled fixture → `paywalled`, a normal article → `ok`. Markers' provenance documented.
- [ ] AC-4: Port renamed `JinaClient`→`ScraperClient`, `jina.py`→`scraper.py`, `JINA_*`→`SCRAPE_*`; all references (steps/fakes/cli/tests) updated; no `Jina` left in live code (historical doc mentions allowed).
- [ ] AC-5: `trafilatura` added to `pyproject.toml` + `uv.lock`; `cli.build_clients` wires the new client; `ruff` + `ruff format` + `pyright` + `pytest` green; `build-minion` CI green.
- [ ] AC-6: A real production smoke run clears the ≥50%/≥5 gate (i.e. the gate no longer fails on rate-limiting) — recorded in the F-013 burn-in log as the first clean post-F-015 run.
- [ ] AC-7: The ingestion state machine, Gmail step, `ScrapedSource` taxonomy, and the ≥50%/≥5 gate semantics are unchanged (no behavior regression in `test_validate_input` / `test_ingestion_pipeline`).

## Out of Scope

- Hosted-reader fallback / hybrid scraping (the port stays open for it; not built here).
- JavaScript rendering / headless browser (trafilatura is static-HTML; JS-only pages count as `failed`).
- Changing the ≥50%/≥5 threshold values or the Gmail ingestion step.
- The publish-repo flip and any other F-013 hardening items.

## Open Questions

- **Threshold under local extraction**: if real-world `ok`-rate sits just under 50% (static extraction misses JS-heavy sources), do we relax `MIN_SOURCES_FRACTION`, or add the hosted fallback? Decide from the first post-F-015 burn-in runs, not upfront.
- **trafilatura tuning**: `favor_precision` vs `favor_recall`, include tables/links? Default to precision for clean synthesis input; confirm in `/plan`.
- **Module name**: `scraper.py` vs `extract.py` for the renamed file — cosmetic; `/plan` picks one.
