# Tasks: Minion ingestion (Gmail + Jina)

**Plan**: specs/004-minion-ingestion/plan.md
**Status**: Done
**Total**: 16 tasks across 3 phases

All commands run from `minion/`. The per-task **Test** is the minimal check; the final task
runs the full gate (`uv run ruff check . && uv run ruff format --check . && uv run pyright &&
uv run pytest`).

## Phase 1: Contracts, config, and the skip path

- [x] **T-1.1**: Ingestion Pydantic models
  - **Do**: Create `minion/src/minion/ingest/__init__.py` and `minion/src/minion/ingest/models.py`
    with `SourceOutcome` (str enum: `ok`/`paywalled`/`failed`), `Newsletter`
    (sender, subject, received_at, candidate_urls), `ScrapedSource` (url, title, markdown,
    outcome), and `SourceSet` (sources list + helpers like `ok_count`/`total`). All
    `model_config = ConfigDict(extra="forbid")` per the `Lock` precedent in `models.py`.
  - **Test**: `uv run pytest tests/ -k "import" || true` then `uv run pyright` (models type-check;
    instantiation smoke-tested by later tasks).

- [x] **T-1.2**: Config constants for ingestion
  - **Do**: In `minion/src/minion/config.py` add `EXCLUDED_SENDERS: frozenset[str] = frozenset()`
    (empty for MVP, AD-10), `GMAIL_SCOPES`, `MAX_NEWSLETTERS = 50`, `MAX_URLS = 100`,
    `JINA_BASE_URL = "https://r.jina.ai/"`, Jina timeout/retry/`JINA_WORKERS` cap,
    `PAYWALL_MARKERS: tuple[str, ...]` (placeholder, confirmed in T-2.2/AD-9),
    `MIN_SOURCES_OK = 5`, `MIN_SOURCES_FRACTION = 0.5`.
  - **Test**: `uv run pyright` and `uv run python -c "from minion import config; assert config.MAX_URLS == 100"`.

- [x] **T-1.3**: Promote Secret Manager helper to the package
  - **Do**: Create `minion/src/minion/secrets.py` with `get`/`require`/`MissingSecretError` and
    the `ANTHROPIC_API_KEY`-absent guard (copied from `spike/secrets.py`, AD-2). Leave
    `spike/secrets.py` untouched.
  - **Test**: `uv run pyright` (strict — `secrets.py` is no longer spike-excluded) and
    `uv run pytest tests/`.

- [x] **T-1.4**: Ingestion ports (Protocols)
  - **Do**: Create `minion/src/minion/ingest/ports.py` with `GmailClient`
    (`fetch_unread(date: str) -> list[Newsletter]`) and `JinaClient`
    (`scrape(urls: list[str]) -> list[ScrapedSource]`) Protocols, mirroring `store/ports.py`.
  - **Test**: `uv run pyright`.

- [x] **T-1.5**: Graceful early-exit terminal signal (orchestrator core, AD-3)
  - **Do**: Add `terminal_status: RunStatus | None = None` and `reason: str | None = None` to
    `StepResult` in `steps/base.py`. In `orchestrator.py`, after a step returns, if
    `result.terminal_status` is set, finalize the run with that status + reason, mark the step
    success, and `break` (not a failure); lock still released in `finally`. Add a
    `test_orchestrator.py` case: a fake step returning `terminal_status=skipped` finalizes the
    run `skipped`, runs no later steps, releases the lock.
  - **Test**: `uv run pytest tests/test_orchestrator.py tests/test_concurrency.py`.

- [x] **T-1.6**: Pure URL extraction
  - **Do**: Create `minion/src/minion/ingest/extract.py` with
    `extract_article_urls(body: str, *, sender_domain: str | None) -> list[str]` using stdlib
    `html.parser` (AD-8): collect `<a href>`, drop `mailto:`/unsubscribe/tracking/social/
    sender-footer links, dedupe preserving order. Create `tests/test_extract.py` covering
    extraction, denylist drops, dedup, and empty body.
  - **Test**: `uv run pytest tests/test_extract.py`.

- [x] **T-1.7**: Fake clients for tests
  - **Do**: Create `minion/src/minion/ingest/fakes.py` with `FakeGmailClient` (returns canned
    `Newsletter`s, optionally raises to simulate auth failure) and `FakeJinaClient` (returns
    canned `ScrapedSource`s keyed by URL, including paywalled/failed outcomes), both satisfying
    the T-1.4 Protocols.
  - **Test**: `uv run pyright` and a `tests/test_extract.py`-style smoke instantiation, or fold
    into T-3.x pipeline tests.

## Phase 2: Real Gmail + Jina clients

- [x] **T-2.1**: Real Gmail client
  - **Do**: Create `minion/src/minion/ingest/gmail.py` — `GmailClient` impl building credentials
    from `secrets.require("gmail-oauth-refresh-token")` (`gmail.readonly`, the proven spike
    pattern), `fetch_unread(date)` querying `users.messages.list` with a date-anchored
    `after:/before:` + `is:unread` window (AD-4), then `users.messages.get` to parse
    sender/subject/body into `Newsletter`s; capped at `MAX_NEWSLETTERS`; auth/refresh failure
    propagates as a raised error. Add `tests/test_gmail_client.py` with a fake `googleapiclient`
    Resource (window query built correctly, 50-cap, auth-error raises).
  - **Test**: `uv run pytest tests/test_gmail_client.py`.

- [x] **T-2.2**: Real Jina client
  - **Do**: Create `minion/src/minion/ingest/jina.py` — `JinaClient` impl scraping each URL via
    `httpx` GET `JINA_BASE_URL + url` under a bounded `ThreadPoolExecutor` (`JINA_WORKERS`),
    per-URL retry/backoff on 429/transient (`outcome=failed` after exhaustion, never raises),
    overall deadline, and paywall detection via `PAYWALL_MARKERS` (`outcome=paywalled`, AD-9).
    Add `tests/test_jina_client.py` using `httpx.MockTransport`: success, 429-then-success,
    persistent-failure→`failed`, paywalled-fixture→`paywalled`. Pin the observed paywall marker
    in the fixture and update `PAYWALL_MARKERS`.
  - **Test**: `uv run pytest tests/test_jina_client.py`.

## Phase 3: Steps, wiring, and end-to-end

- [x] **T-3.1**: `GmailStep`
  - **Do**: Create `minion/src/minion/steps/ingestion.py` with `GmailStep` (`name=StepName.gmail`)
    that calls the injected `GmailClient`, applies `EXCLUDED_SENDERS` (address or `@domain`,
    case-insensitive, AD-10), extracts + dedupes + caps URLs at `MAX_URLS` (logging truncation),
    and returns `StepResult(payload={"newsletters": ..., "candidate_urls": ...})`. Add
    `tests/test_gmail_step.py` over `FakeGmailClient` (denylist filtering, URL cap, auth-fail →
    raises → orchestrator failure).
  - **Test**: `uv run pytest tests/test_gmail_step.py`.

- [x] **T-3.2**: `JinaStep`
  - **Do**: Add `JinaStep` (`name=StepName.jina`) to `steps/ingestion.py`: reads
    `ctx.data["candidate_urls"]`, calls the injected `JinaClient`, returns
    `StepResult(payload={"sources": ...})`. Add `tests/test_jina_step.py` over `FakeJinaClient`
    (sources passed through, paywalled/failed outcomes preserved, step never raises on a
    failed source).
  - **Test**: `uv run pytest tests/test_jina_step.py`.

- [x] **T-3.3**: `ValidateInputStep` (skip + threshold gate)
  - **Do**: Add `ValidateInputStep` (`name=StepName.validate_input`) to `steps/ingestion.py`:
    no newsletters or no candidate URLs → `StepResult(terminal_status=skipped, reason="no_sources")`
    (AD-3); else gate on `ok_count >= MIN_SOURCES_OK AND ok_count/total >= MIN_SOURCES_FRACTION`
    — pass forwards the validated `SourceSet`, fail raises `insufficient_sources: {ok}/{total}`.
    Add `tests/test_validate_input.py` (skip, pass, fail-on-fraction, fail-on-count).
  - **Test**: `uv run pytest tests/test_validate_input.py`.

- [x] **T-3.4**: Pipeline factory + CLI wiring
  - **Do**: Add `build_pipeline(gmail_client, jina_client) -> tuple[Step, ...]` to
    `steps/__init__.py` (real gmail/jina/validate_input + the six existing stubs, in
    `STEP_ORDER`); keep module-level `STEPS` (all stubs) as default (AD-5). Wire `cli.py` to
    construct the real clients from secrets and pass `build_pipeline(...)` to `run_pipeline`.
    Update `tests/test_steps.py` so stub-shape assertions target the six remaining stubs.
  - **Test**: `uv run pytest tests/test_steps.py tests/test_cli.py`.

- [x] **T-3.5**: End-to-end ingestion pipeline tests
  - **Do**: Create `tests/test_ingestion_pipeline.py` running `run_pipeline` with fakes +
    in-memory stores (the conftest fixtures), covering the six spec scenarios: happy path
    (success), threshold-pass (degraded but ≥50%/≥5), threshold-fail (`failure`,
    `insufficient_sources`), empty-mailbox (`skipped`/`no_sources`, later steps not run),
    paywall exclusion (paywalled not counted OK), denylist filtering.
  - **Test**: `uv run pytest tests/test_ingestion_pipeline.py`.

- [x] **T-3.6**: Full gate
  - **Do**: Resolve any lint/format/type findings across the feature; ensure no bare `print`
    (T20), no `any`-equivalents, all boundaries Pydantic.
  - **Test**: `uv run ruff check . && uv run ruff format --check . && uv run pyright &&
    uv run pytest`.
