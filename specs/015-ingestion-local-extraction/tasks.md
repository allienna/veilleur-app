# Tasks: Ingestion resilience — local content extraction

**Plan**: specs/015-ingestion-local-extraction/plan.md
**Status**: Ready
**Total**: 9 tasks across 3 phases

> Run minion checks from `minion/`: `uv run ruff check .`, `uv run ruff format --check .`, `uv run pyright`, `uv run pytest`. Phase 1 delivers the fix (engine); Phase 2 is the coherence rename; Phase 3 verifies + hands off to burn-in.

## Phase 1: Local extraction engine (the fix)

- [x] **T-1.1**: Add `trafilatura` dependency
  - **Do**: Add `trafilatura` to `minion/pyproject.toml` `[project].dependencies`; run `uv lock`. Note the dep + rationale (Jina rate-limit, see PRD §5 amendment) for the eventual PR description.
  - **Test**: `cd minion && uv sync && uv run python -c "import trafilatura; print(trafilatura.__version__)"`.

- [x] **T-1.2**: Add scrape config constants + recalibrate paywall markers
  - **Do**: In `minion/src/minion/config.py` add `SCRAPE_USER_AGENT` (realistic browser UA). Add `SCRAPE_TIMEOUT/MAX_RETRIES/BACKOFF_BASE/WORKERS/DEADLINE` (values copied from the `JINA_*` originals; the old `JINA_*` are removed in Phase 2). Recalibrate `PAYWALL_MARKERS` for raw publisher HTML (not Jina output) with a provenance comment. Leave `MIN_SOURCES_OK/MIN_SOURCES_FRACTION/MAX_URLS` unchanged.
  - **Test**: `cd minion && uv run ruff check src/minion/config.py && uv run pyright src/minion/config.py`.

- [x] **T-1.3**: Implement `LocalExtractorClient` in `scraper.py`
  - **Do**: New `minion/src/minion/ingest/scraper.py`. Port jina.py's `ThreadPoolExecutor` + retry/backoff + deadline + `scrape()` structure verbatim. Per URL: `httpx` GET the **origin URL** (client built with `follow_redirects=True`, `headers={"User-Agent": SCRAPE_USER_AGENT}`, `timeout=SCRAPE_TIMEOUT`); retry on `TransportError` + `{429,500,502,503,504}`; non-2xx → `failed`. On 2xx: paywall-marker check on raw HTML → `paywalled`; else `body=extract(html, output_format="markdown", favor_precision=True)`, `title=metadata(html).title`; empty/None `body` → `failed`, else `ScrapedSource(ok, title, markdown=body)`. Keep `client`/`sleep` injectable. Implements the existing scrape Protocol structurally (no rename yet). Never raises for one bad source.
  - **Test**: `cd minion && uv run ruff check src/minion/ingest/scraper.py && uv run pyright src/minion/ingest/scraper.py`.

- [x] **T-1.4**: Tests for `LocalExtractorClient`
  - **Do**: New `minion/tests/test_scraper_client.py` using `httpx.MockTransport` + no-op sleep, with canned HTML fixtures (inline or `tests/fixtures/`). Cases: article HTML → `ok` (non-empty markdown + title); paywall-marker HTML → `paywalled`; empty/JS-shell HTML (trafilatura None) → `failed`; 403/404 → `failed`; 429/5xx → retried then `failed`; `TransportError` → retried then `failed`; deadline → unfinished `failed`; empty URL list → `[]`; order preserved.
  - **Test**: `cd minion && uv run pytest tests/test_scraper_client.py -q`.

- [x] **T-1.5**: Wire the new client; delete `jina.py`
  - **Do**: In `minion/src/minion/cli.py` `build_clients`, construct `LocalExtractorClient` where `JinaReaderClient()` was. Delete `minion/src/minion/ingest/jina.py` and `minion/tests/test_jina_client.py` (superseded by T-1.3/T-1.4). Update `minion/src/minion/ingest/__init__.py` export.
  - **Test**: `cd minion && uv run pytest -q` (whole suite green; no stale jina import).

## Phase 2: Coherence rename (FR-4)

- [x] **T-2.1**: Rename the scrape port `JinaClient` → `ScraperClient`
  - **Do**: In `minion/src/minion/ingest/ports.py` rename the Protocol + de-Jina the docstring. Update `ingest/__init__.py`, `ingest/fakes.py` (fake scraper class name), and `scraper.py`'s implements-reference. Update every importer/type annotation (`cli.py`, `steps/ingestion.py`, tests: `test_ingestion_pipeline`, `test_run_cost`, `test_steps`, `test_generation_pipeline`, `test_publish_integration`, etc.).
  - **Test**: `cd minion && grep -rn "JinaClient" src tests` returns nothing; `uv run pyright`.

- [x] **T-2.2**: Rename `JINA_*` config → `SCRAPE_*`; drop `JINA_BASE_URL`
  - **Do**: In `config.py` remove the now-duplicated old `JINA_*` constants in favor of the `SCRAPE_*` added in T-1.2 (or rename in place if T-1.2 kept both); ensure `JINA_BASE_URL` is gone and all references use `SCRAPE_*`. Update `scraper.py` + any test references.
  - **Test**: `cd minion && grep -rn "JINA_" src tests` returns nothing; `uv run pyright && uv run pytest -q`.

- [x] **T-2.3**: Rename step class `JinaStep` → `ScrapeStep`; retain `StepName.jina` wire value
  - **Do**: In `minion/src/minion/steps/ingestion.py` rename the class `JinaStep` → `ScrapeStep`; update `steps/__init__.py`, `build_pipeline`, and tests (`test_jina_step.py` → `test_scrape_step.py`). **Do NOT change the `StepName.jina` enum value** (shared-schema/PWA wire contract) — add a one-line comment that `jina` is the scrape step's stable wire name. Update the constitution module-shape example `jina.py` → `scraper.py`.
  - **Test**: `cd minion && grep -rn "JinaStep\|JinaReader" src tests` returns nothing; `grep -rn "StepName.jina\|\"jina\"" src` still present (wire value kept); `uv run pytest -q`.

## Phase 3: Verify + burn-in handoff

- [x] **T-3.1**: Full minion regression gates
  - **Do**: Run the complete suite; fix any fallout. Confirm `test_validate_input` + `test_ingestion_pipeline` pass unchanged (taxonomy + ≥50%/≥5 gate semantics preserved, AC-7).
  - **Test**: `cd minion && uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest` all green.

- [ ] **T-3.2**: Ship + production smoke + burn-in row (post-merge, AC-6)
  - **Do**: After PR merge, `./scripts/deploy-minion.sh` then `gcloud run jobs execute minion --region=europe-west1 --wait`. Read the `jina scraped` breakdown (ok/paywalled/failed) + the run status; record the first clean run in `specs/013-hardening-burn-in/burn-in-log.md`. If the gate still fails, capture the breakdown and trigger the deferred threshold/fallback decision.
  - **Test**: A production run clears the ≥50%/≥5 gate (status `success`/`success_with_warnings`); burn-in log row added. (Operator-run; does not gate the PR.)
