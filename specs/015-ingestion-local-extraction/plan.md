# Plan: Ingestion resilience — local content extraction

**Spec**: specs/015-ingestion-local-extraction/spec.md

This track swaps the scrape engine behind the existing port. The current `jina.py` is already well-factored — bounded `ThreadPoolExecutor`, per-URL retry/backoff, overall deadline, `ok/paywalled/failed` taxonomy, "never raises for one bad source." **All of that scaffolding is reused verbatim**; only two things change: the *fetch target* (origin URL directly, not `r.jina.ai/<url>`) and the *extraction* (`trafilatura` instead of treating the raw response body as Markdown + parsing Jina's `Title:` header). trafilatura API confirmed via context7: `extract(html, output_format="markdown", favor_precision=True) -> str | None`; `metadata(html).title -> str | None`.

## Architecture Decisions

### AD-1: New `scraper.py` replaces `jina.py`, reusing its concurrency/retry scaffolding
- **Choice**: Create `minion/src/minion/ingest/scraper.py` with `LocalExtractorClient`, porting `jina.py`'s thread-pool + retry + deadline + `scrape()` structure unchanged. Delete `jina.py`. Per URL: `httpx` GET the **origin URL** → on success, extract with trafilatura → `ScrapedSource`.
- **Rationale**: The orchestration around scraping is sound and battle-tested; the rate-limit problem is purely the *engine*. Reusing the scaffolding keeps the diff focused on what actually changed and preserves the `ok/paywalled/failed` contract (spec FR-1, AC-7).
- **Alternatives considered**: Edit `jina.py` in place (muddier history; the file's identity changes); a brand-new design (throws away proven retry/deadline logic).

### AD-2: Browser-like, direct-origin fetch
- **Choice**: `httpx.Client(timeout=SCRAPE_TIMEOUT, follow_redirects=True, headers={"User-Agent": SCRAPE_USER_AGENT})`. GET the origin URL directly (no proxy/reader prefix). Retry on `httpx.TransportError` + retryable statuses `{429, 500, 502, 503, 504}` (reused set; 429 now from origins, rare). Non-2xx (after retries) → `failed`. Overall `SCRAPE_DEADLINE` + bounded `SCRAPE_WORKERS` pool retained; politeness is per-origin now (no central limit).
- **Rationale**: Bare clients get 403'd by many publishers; a realistic UA + redirects maximizes fetch yield (spec FR-2). No central rate limit means the deadline/worker bounds are now about politeness + the 5-min ingestion budget (PRD §4), not throttle avoidance.
- **Alternatives considered**: `trafilatura.fetch_url` (its own downloader) — loses `httpx.MockTransport` testability and timeout control we already have.

### AD-3: Extraction = trafilatura markdown body + metadata title; empty → `failed`
- **Choice**: On a 2xx HTML response, `body = extract(html, output_format="markdown", favor_precision=True)`; `title = metadata(html).title`. If `body` is `None`/blank → `failed` (JS-only shells, non-article pages, parse failures all land here). Otherwise `ScrapedSource(ok, title, markdown=body)`.
- **Rationale**: `favor_precision` yields clean synthesis input (fewer nav/boilerplate fragments) — better for `/generate` than recall. Empty extraction is the dominant "JS-only/SPA" failure mode and must be `failed`, never a malformed `ok` (spec error-scenarios, AC-1/AC-2).
- **Alternatives considered**: `favor_recall` (more text, more noise); `bare_extraction` (LXML objects — unnecessary; we want a markdown string).

### AD-4: Paywall detection on the fetched HTML, markers recalibrated
- **Choice**: Run the paywall-marker check against the **raw fetched HTML** (before/independent of trafilatura, which may strip the notice) — if a marker is present → `paywalled`. Recalibrate `PAYWALL_MARKERS` for real publisher HTML (the current set was tuned to Jina's *output*). Keep the deterministic-marker approach (no heuristic guessing); document provenance in a code comment mirroring the original.
- **Rationale**: Paywall exclusion is a constitution §4 / FR-A3 obligation. trafilatura can drop the paywall banner during extraction, so detect on raw HTML. Markers stay an allowlist (auditable), not a fuzzy short-content heuristic (false positives would wrongly drop good sources). Marker recalibration is genuine work, gated by AC-3.
- **Alternatives considered**: short-extract heuristic (truncated body ⇒ paywall) — too many false positives on legitimately short posts; defer as a possible future signal.

### AD-5: Rename minion-internal symbols; **retain the `StepName.jina` wire value**
- **Choice**: Rename `JinaClient` Protocol → `ScraperClient` (`ports.py`), `JinaReaderClient` → `LocalExtractorClient`, `JinaStep` → `ScrapeStep` (class only), `jina.py` → `scraper.py`, `test_jina_client.py` → `test_scraper_client.py`, and `JINA_*` config → `SCRAPE_*` (drop `JINA_BASE_URL` entirely). Update `ingest/__init__.py`, `fakes.py`, `cli.py`, `steps/ingestion.py`, all tests, and the constitution module-shape example (`jina.py` → `scraper.py`). **Do NOT rename the `StepName.jina` enum value** — it is a shared-schema wire contract (`shared/schema/run.json`) read by the PWA (`STEP_ORDER`, `RunStepRow`) and stamped into every historical `runs/{date}/steps/jina` doc.
- **Rationale**: Coherence (FR-G1 / spec FR-4) — no live `Jina` symbol when Jina is gone. But the `StepName` enum is a cross-service wire value; renaming it would force a `shared/` codegen change, a PWA update, and would orphan every existing run doc's step name — disproportionate churn days before the talk, and the spec explicitly keeps "the ingestion state machine unchanged." A one-line comment on the `jina` enum member notes it is the scrape step (engine-neutral meaning).
- **Alternatives considered**: Rename the enum too (clean but cross-boundary breaking + run-doc history orphaned); skip the rename entirely (leaves incoherent `JinaClient` — fails FR-4).

### AD-6: `SCRAPE_*` config + new `SCRAPE_USER_AGENT`; gate/cap constants untouched
- **Choice**: `JINA_TIMEOUT/MAX_RETRIES/BACKOFF_BASE/WORKERS/DEADLINE` → `SCRAPE_TIMEOUT/MAX_RETRIES/BACKOFF_BASE/WORKERS/DEADLINE`; drop `JINA_BASE_URL`; add `SCRAPE_USER_AGENT`. Leave `MIN_SOURCES_OK`, `MIN_SOURCES_FRACTION`, `MAX_URLS`, `PAYWALL_MARKERS` (engine-neutral already; values unchanged — threshold tuning is a deferred open question driven by real runs, not this plan).
- **Rationale**: Keeps the validation gate semantics identical (AC-7) while the engine config gets coherent names.
- **Alternatives considered**: renaming the gate constants too (they were never Jina-specific — needless churn).

## Affected Files

### New Files
| File | Purpose |
|---|---|
| `minion/src/minion/ingest/scraper.py` | `LocalExtractorClient` (`ScraperClient` impl): httpx fetch + trafilatura extract + paywall markers, reusing the pool/retry/deadline scaffolding. |
| `minion/tests/test_scraper_client.py` | Replaces `test_jina_client.py`: MockTransport fetch + canned-HTML extraction → ok/paywalled/failed; retry/deadline behavior. |
| `minion/tests/fixtures/` (HTML samples, if not inlined) | Article / paywalled / JS-shell HTML for deterministic trafilatura assertions. |

### Modified Files
| File | Change |
|---|---|
| `minion/pyproject.toml` (+ `uv.lock`) | Add `trafilatura` dependency (reviewed in the PR description per CLAUDE.md). |
| `minion/src/minion/ingest/ports.py` | `JinaClient` → `ScraperClient` Protocol (docstring de-Jina'd). |
| `minion/src/minion/ingest/__init__.py` | Update exported name. |
| `minion/src/minion/ingest/fakes.py` | `Fake*` scraper renamed to the new port name; behavior unchanged. |
| `minion/src/minion/config.py` | `JINA_*` → `SCRAPE_*`, drop `JINA_BASE_URL`, add `SCRAPE_USER_AGENT`; recalibrate `PAYWALL_MARKERS` + provenance comment. |
| `minion/src/minion/steps/ingestion.py` | `JinaStep` → `ScrapeStep` (class); `StepName.jina` value retained + clarifying comment. |
| `minion/src/minion/cli.py` | `build_clients` constructs `LocalExtractorClient`. |
| `minion/src/minion/ingest/jina.py` | **Deleted** (replaced by `scraper.py`). |
| `minion/tests/{test_jina_step,test_ingestion_pipeline,test_run_cost,...}.py` | Update imports/symbols to the renamed port/class/config. |
| `specs/constitution.md` | Module-shape example `jina.py` → `scraper.py`. |

## Implementation Phases

### Phase 1: Local extraction engine behind the existing port (the fix)
- Add `trafilatura` to `pyproject.toml`; `uv lock`.
- Implement `scraper.py` `LocalExtractorClient` (httpx browser-like fetch + trafilatura markdown/title + paywall-on-raw-HTML), reusing jina.py's pool/retry/deadline. Implements the existing port structurally (no rename yet).
- Recalibrate `PAYWALL_MARKERS`; add `SCRAPE_USER_AGENT`.
- Tests: `httpx.MockTransport` for fetch; canned HTML fixtures → ok (markdown+title) / paywalled / failed; non-2xx + TransportError → retry-then-failed; deadline path.
- Wire `cli.build_clients` to the new client; delete `jina.py`.
- **Delivers** AC-1, AC-2, AC-3, AC-5 (engine side). The pipeline can now scrape without a central rate limit.

### Phase 2: Coherence rename (FR-4)
- Rename Protocol/class/module/config symbols (AD-5/AD-6); update `ports`, `__init__`, `fakes`, `steps`, `cli`, all tests, constitution module-shape line. Retain `StepName.jina` wire value + comment.
- One mechanical sweep; keep it a distinct commit so review is tractable.
- **Delivers** AC-4. CI (`build-minion`) green.

### Phase 3: Verify + burn-in handoff
- Full local gates: `ruff` + `ruff format --check` + `pyright` + `pytest`. Confirm `test_validate_input` / `test_ingestion_pipeline` unchanged (AC-7).
- After merge: `./scripts/deploy-minion.sh`, then a production smoke (`gcloud run jobs execute minion --wait`). Record the first clean run in the F-013 burn-in log (AC-6 — verified here, does not gate this PR).

## Test Strategy
- **Mocking approach**: `httpx.MockTransport` for the fetch layer (existing pattern in `test_jina_client.py`) + a no-op `sleep` injectable; **trafilatura runs for real** on static HTML fixtures (deterministic — no mock needed).
- **Happy paths**: article HTML → `ok` with non-empty markdown + extracted title; multiple URLs → one `ScrapedSource` each, order preserved.
- **Error scenarios**: 403/404 → `failed`; 429/5xx → retried `SCRAPE_MAX_RETRIES` then `failed`; `TransportError`/timeout → retried then `failed`; deadline exceeded → unfinished URLs `failed`.
- **Edge cases**: empty/JS-shell HTML (trafilatura returns None) → `failed` (not malformed `ok`); paywall-marker HTML → `paywalled`; non-HTML content-type → `failed`; empty URL list → `[]`.
- Regression guard: `test_validate_input` + `test_ingestion_pipeline` stay green unchanged (taxonomy + gate semantics preserved).

## Risk & Complexity
- **Estimated complexity**: Medium (new dep + rename sweep; the engine itself is small and reuses proven scaffolding).
- **Key risks**:
  - **Real-world extraction yield** is only provable in burn-in (AC-6). Static extraction misses JS-only sites; if the `ok`-rate sits just under 50%, the deferred decision fires (relax `MIN_SOURCES_FRACTION` or add the hosted fallback the port keeps open). Not a code risk — a tuning decision from data.
  - **Paywall-marker recalibration** is empirical; an over-broad marker wrongly drops good sources, an under-broad one leaks paywalled text (copyright). Keep the allowlist conservative + documented.
  - **Rename blast radius** (~10 files + tests). Mitigated by keeping it a separate Phase-2 commit and *not* touching the `StepName.jina` wire value.
  - **`trafilatura` transitive deps** (lxml etc.) increase the Minion image size; acceptable, noted in the PR.
- **New dependencies**: `trafilatura` (Python, minion only). `httpx` already present.
