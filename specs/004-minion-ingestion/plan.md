# Plan: Minion ingestion (Gmail + Jina)

**Spec**: specs/004-minion-ingestion/spec.md

This plan resolves the spec's eight Open Questions as Architecture Decisions (AD-3…AD-10
map to spec OQ#6, #1, #5, #3, #2, #4, #7, #8). It mirrors the F-003 patterns already in the
codebase: **ports + in-memory fakes** (`store/ports.py` + `store/memory.py`), an **injected
`Clock`**, and the `Step`/`StepResult` contract in `steps/base.py`.

## Architecture Decisions

### AD-1: `ingest/` subpackage mirroring the `store/` ports+fakes pattern
- **Choice**: New `minion/src/minion/ingest/` package with `ports.py` (`GmailClient`,
  `JinaClient` Protocols), real implementations (`gmail.py`, `jina.py`), `fakes.py` (fake
  clients for tests), `models.py` (ingestion Pydantic models), and `extract.py` (pure
  URL-extraction functions). The three real steps live in `steps/ingestion.py`.
- **Rationale**: F-003 already proved this shape with `RunStore`/`LockStore` + `InMemory*`
  fakes; reusing it keeps tests hermetic and the orchestrator unaware of transport. (Resolves
  spec OQ#8 → ports.)
- **Alternatives considered**: Mocking the `googleapiclient` Resource chain and `httpx`
  directly in each test — rejected as brittle and inconsistent with the established pattern.

### AD-2: Promote secrets + Gmail OAuth out of `spike/` into the package proper
- **Choice**: Create production `minion/src/minion/secrets.py` (the `get`/`require`/
  `MissingSecretError` API + the constitution §2 principle-2 `ANTHROPIC_API_KEY`-absent guard,
  copied from `spike/secrets.py`) and build the real Gmail client on the proven
  `spike/gmail.py` credential pattern (`gmail-oauth-refresh-token` secret, `gmail.readonly`
  scope). `spike/` is left untouched (it stays pyright-excluded and slated for deletion).
- **Rationale**: The spike validated the chain but is throwaway and not strict-typed. F-004
  needs this as production, strict-typed, tested code.
- **Alternatives considered**: Importing from `spike/` — rejected; production code must not
  depend on a module marked for deletion and excluded from type checking.

### AD-3: Graceful early-exit via a `StepResult` terminal signal (spec OQ#6, FR-6)
- **Choice**: Extend `StepResult` with `terminal_status: RunStatus | None = None` and
  `reason: str | None = None`. When a step returns a result carrying `terminal_status`, the
  orchestrator finalizes the run with that status + reason and halts the remaining steps —
  **without** treating it as a failure. `validate_input` uses this to end an empty-mailbox run
  as `skipped` / `no_sources`.
- **Rationale**: Raising already means *failure* in the F-003 contract; a return-value signal
  keeps a graceful skip a first-class, non-error terminal path while preserving every F-003
  invariant (idempotent replay, lock release in `finally`, per-step observability). Generic
  enough for future skip reasons.
- **Alternatives considered**: A dedicated control exception caught by the orchestrator —
  rejected because it overloads the "raise == failure" semantic and muddies AC-7.

### AD-4: 24h unread window anchored to the run `date` (spec OQ#1)
- **Choice**: The `gmail` step queries Gmail with an absolute window derived from the run
  `date` in Europe/Paris (`after:`/`before:` epoch bounds for `[date 00:00, date+1d 00:00)`,
  combined with `is:unread`), not `newer_than:1d` relative to `now()`.
- **Rationale**: Date-anchoring makes a replay of date `D` see the same mailbox slice → true
  idempotency, consistent with F-003's date-keyed run identity.
- **Alternatives considered**: `newer_than:1d` — simpler but a same-day replay would ingest a
  different set; rejected.

### AD-5: Pipeline assembled by a `build_pipeline(clients)` factory; clients injected
- **Choice**: Add `build_pipeline(gmail_client, jina_client) -> tuple[Step, ...]` in
  `steps/__init__.py` returning real `GmailStep`/`JinaStep`/`ValidateInputStep` for the first
  three slots and the existing stubs for the remaining six, in `STEP_ORDER`. `cli.py`
  constructs the real clients (from secrets) and passes the pipeline to
  `run_pipeline(steps=...)`. Tests pass a pipeline built with fakes. The module-level `STEPS`
  (all stubs) stays as the zero-arg default.
- **Rationale**: Real steps need injected dependencies; building them at import time would
  force network/secret access on import. The orchestrator already accepts `steps=` — no core
  change needed there for wiring.
- **Alternatives considered**: Global singleton clients constructed at import — rejected
  (breaks hermetic tests and the no-I/O-on-import rule).

### AD-6: Ingestion data stays Minion-internal; shared schema unchanged (spec OQ#7)
- **Choice**: `Newsletter`, `CandidateUrls`, `ScrapedSource`, `SourceSet` are Pydantic models
  in `ingest/models.py`, carried in the orchestrator data bag (`ctx.data`). The PWA-facing
  `shared/schema/run.json` is **not** extended; per-step source counts are emitted to the
  structured log, not written to Firestore.
- **Rationale**: These are intermediate pipeline values, not PWA contract. Avoiding a schema
  change keeps `pnpm check:codegen` untouched and scope tight. A supervision-facing source
  count can be added later if F-011 wants it.
- **Alternatives considered**: Extending `run.json` with a `sources` summary now — deferred;
  no current consumer (F-011 is later).

### AD-7: Bounded-concurrency Jina scraping with per-request retry/backoff (spec OQ#3)
- **Choice**: Scrape via a bounded thread pool (`concurrent.futures.ThreadPoolExecutor`, small
  worker cap, default in `config.py`) over a synchronous `httpx` client, with per-URL
  retry+backoff on `429`/transient errors and an overall ingestion deadline. A URL that
  exhausts retries is recorded `failed` (never raises out of the step).
- **Rationale**: Up to 100 URLs sequentially risks the ≤3 min target / 5 min ceiling (§4);
  bounded concurrency respects both the budget and the unknown free-tier rate limit while
  keeping the codebase synchronous (no async migration).
- **Alternatives considered**: Pure sequential (simplest, but budget-risky at 100 URLs);
  full async `httpx.AsyncClient` (larger blast radius, the rest of the code is sync).

### AD-8: URL extraction as a pure function with a non-article denylist (spec OQ#2)
- **Choice**: `extract_article_urls(body, *, sender_domain)` in `ingest/extract.py` parses
  links with the **stdlib `html.parser`** (no new dependency), drops obvious non-article links
  (`mailto:`, unsubscribe/list-management, tracking/pixel/CDN hosts, social, the sender's own
  footer domain), then deduplicates and the caller caps at 100.
- **Rationale**: Pure and trivially unit-testable; conservative (drop only clear non-articles).
  stdlib parser avoids a reviewed new dependency.
- **Alternatives considered**: `beautifulsoup4`/`lxml` — defer; only add (with PR review per
  CLAUDE.md) if the stdlib parser proves inadequate. The heuristic is expected to be tuned
  during burn-in (F-013).

### AD-9: Paywall detection via configurable Jina output markers (spec OQ#4)
- **Choice**: The `JinaClient` flags a source `paywalled` when its Markdown contains any of a
  configurable set of marker substrings (`config.py`). The exact marker is confirmed
  empirically against a real paywalled URL and captured as a test fixture.
- **Rationale**: The marker shape is unverified until probed; keeping it data-driven lets the
  fixture pin observed reality without code changes.
- **Alternatives considered**: Hard-coding a guessed marker — rejected; unverifiable.

### AD-10: `EXCLUDED_SENDERS` denylist — address or `@domain`, case-insensitive (spec OQ#5)
- **Choice**: Add `EXCLUDED_SENDERS: frozenset[str] = frozenset()` to `config.py` (empty for
  MVP). A newsletter is dropped if its parsed `From` address (lowercased) equals a denylist
  entry **or** its domain matches an `@domain` entry.
- **Rationale**: Supports both granularities the operator is likely to want, matches PRD §7's
  "maintained manually," and is order-independent (frozenset).
- **Alternatives considered**: Exact-address only — too coarse for muting a whole sender domain.

## Affected Files

### New Files
| File | Purpose |
|------|---------|
| `minion/src/minion/secrets.py` | Production Secret Manager helper (`get`/`require`/`MissingSecretError` + API-key-absent guard), promoted from `spike/`. |
| `minion/src/minion/ingest/__init__.py` | Ingestion subpackage exports. |
| `minion/src/minion/ingest/ports.py` | `GmailClient` + `JinaClient` Protocols. |
| `minion/src/minion/ingest/models.py` | `Newsletter`, `ScrapedSource`, `SourceSet` (+ outcome enum) Pydantic models. |
| `minion/src/minion/ingest/gmail.py` | Real `GmailClient` (google-api-python-client, `gmail.readonly`, date-anchored window). |
| `minion/src/minion/ingest/jina.py` | Real `JinaClient` (httpx, bounded concurrency, retry/backoff, paywall markers). |
| `minion/src/minion/ingest/extract.py` | Pure URL-extraction + denylist/dedup/cap helpers. |
| `minion/src/minion/ingest/fakes.py` | `FakeGmailClient` / `FakeJinaClient` for hermetic tests. |
| `minion/src/minion/steps/ingestion.py` | `GmailStep`, `JinaStep`, `ValidateInputStep` (real `Step` impls). |
| `minion/tests/test_extract.py` | URL extraction, denylist, dedup, cap unit tests. |
| `minion/tests/test_gmail_step.py` | Gmail step over `FakeGmailClient` (window, denylist, 50-cap, auth-fail). |
| `minion/tests/test_jina_step.py` | Jina step/client (scrape, retry/backoff, paywall, failed-source) with mocked transport. |
| `minion/tests/test_validate_input.py` | Threshold gate + skip/no_sources logic. |
| `minion/tests/test_ingestion_pipeline.py` | End-to-end via fakes: happy, threshold-pass, threshold-fail, skip, paywall, denylist. |

### Modified Files
| File | Change |
|------|--------|
| `minion/src/minion/steps/base.py` | Add `terminal_status` + `reason` to `StepResult` (AD-3). |
| `minion/src/minion/orchestrator.py` | Honor a step's `terminal_status`: finalize run with it + reason, halt remaining steps, not a failure (AD-3). |
| `minion/src/minion/steps/__init__.py` | Add `build_pipeline(gmail_client, jina_client)` factory; keep `STEPS` (all stubs) as default (AD-5). |
| `minion/src/minion/config.py` | Add `EXCLUDED_SENDERS`, `GMAIL_SCOPES`, newsletter/URL caps, Jina base URL/timeouts/retry/concurrency, paywall markers (AD-7/9/10). |
| `minion/src/minion/cli.py` | Build real clients from secrets, assemble via `build_pipeline`, pass to `run_pipeline` (AD-5). |
| `minion/tests/test_steps.py` | Update the three former-stub expectations now that `gmail`/`jina`/`validate_input` are real (stub-shape assertions move to the six remaining stubs). |
| `minion/tests/test_orchestrator.py` | Add coverage for the `terminal_status` skip path (run finalized `skipped`, remaining steps not run, lock released). |

## Implementation Phases

### Phase 1: Contracts, config, and the skip path (foundation)
- `ingest/models.py`: `Newsletter`, `ScrapedSource` (+ `SourceOutcome` enum: `ok`/`paywalled`/
  `failed`), `SourceSet`.
- `ingest/ports.py`: `GmailClient`, `JinaClient` Protocols.
- `config.py`: `EXCLUDED_SENDERS`, `GMAIL_SCOPES`, `MAX_NEWSLETTERS=50`, `MAX_URLS=100`, Jina
  base URL / timeout / retry / worker-cap / `PAYWALL_MARKERS`, threshold constants
  (`MIN_SOURCES_OK=5`, `MIN_SOURCES_FRACTION=0.5`).
- `secrets.py`: promote from spike (AD-2).
- `steps/base.py` + `orchestrator.py`: the `terminal_status` skip path (AD-3) + orchestrator
  test.
- `ingest/extract.py` + `test_extract.py`: pure extraction/denylist/dedup/cap.
- `ingest/fakes.py`: fakes implementing the ports.

### Phase 2: Real Gmail + Jina clients
- `ingest/gmail.py`: credentials from `secrets.require("gmail-oauth-refresh-token")`,
  `users.messages.list` (date-anchored `after:/before:` + `is:unread`) → `users.messages.get`
  → parsed `Newsletter` list; auth/refresh failure surfaces as a raised error. Unit-tested
  with a fake Gmail Resource.
- `ingest/jina.py`: bounded-concurrency scrape via `httpx` with retry/backoff, deadline,
  paywall-marker detection → `ScrapedSource` list. Unit-tested with `httpx.MockTransport`
  (success, 429-then-success, persistent-failure, paywalled fixture).

### Phase 3: Steps, wiring, and end-to-end
- `steps/ingestion.py`: `GmailStep` (calls `GmailClient`, applies denylist + caps, extracts
  URLs, returns `{newsletters, candidate_urls}`), `JinaStep` (scrapes `ctx.data["candidate_urls"]`,
  returns `{sources}`), `ValidateInputStep` (no-sources → `terminal_status=skipped`/`no_sources`;
  threshold gate → pass or raise `insufficient_sources`).
- `steps/__init__.py` `build_pipeline` factory + `cli.py` wiring.
- `test_ingestion_pipeline.py`: the six scenarios through `run_pipeline` with fakes; update
  `test_steps.py`.
- Final gate: `uv run ruff check . && uv run ruff format --check . && uv run pyright &&
  uv run pytest`.

## Test Strategy
- **Mocking approach**: Ports + fakes (the F-003 pattern) for step/pipeline tests —
  `FakeGmailClient` returns canned `Newsletter`s; `FakeJinaClient` returns canned
  `ScrapedSource`s keyed by URL (including paywalled and failing). Real-client unit tests mock
  the transport only: a fake `googleapiclient` Resource for Gmail, `httpx.MockTransport` for
  Jina. **No live network in any test** (keeps `build-minion` CI hermetic).
- **Happy paths**: `gmail` returns newsletters → URLs extracted/deduped/capped; `jina` scrapes
  all OK; `validate_input` passes; downstream stubs run; run ends `success`.
- **Error scenarios**: Gmail auth failure → `gmail` step + run `failure` (AC-7); Jina 429 →
  retried then succeeds, persistent failure → source `failed`, step does not raise (AC-8);
  threshold-fail (3/12 OK) → run `failure` `insufficient_sources` (AC-5).
- **Edge cases**: empty mailbox / zero URLs → run `skipped`/`no_sources`, remaining steps not
  executed, lock released (AC-6); paywalled sources excluded from OK count (AC-4); sender in
  `EXCLUDED_SENDERS` filtered (denylist); `>50` newsletters and `>100` URLs truncated with a
  log line; duplicate URLs across newsletters collapsed.

## Risk & Complexity
- **Estimated complexity**: Medium-High — two external integrations plus a quality gate, and
  it modifies the F-003 core state machine (the skip path).
- **Key risks**:
  - *Jina free-tier rate limit is unknown* → concurrency/backoff needs empirical tuning; 100
    URLs must fit the ≤3 min target / 5 min ceiling. Mitigation: configurable worker cap +
    deadline; tune in burn-in (F-013).
  - *Paywall marker shape unverified* (AD-9) → must be confirmed against a real paywalled URL
    and pinned as a fixture before AC-4 is trustworthy.
  - *URL-extraction heuristic noise* (AD-8) → may forward tracking links (wasted Jina budget)
    or drop real articles; conservative denylist + burn-in tuning.
  - *Touching the F-003 orchestrator* (AD-3) → must preserve idempotency/concurrency/lock-release
    invariants; covered by existing + new orchestrator tests.
- **New dependencies**: none — `httpx` and `google-api-python-client` are already declared in
  `minion/pyproject.toml`. URL parsing uses the stdlib `html.parser` (AD-8). If that proves
  inadequate, adding `beautifulsoup4` is a `/tasks`-time decision requiring PR review per
  CLAUDE.md.
```
