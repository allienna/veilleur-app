# Plan: Minion orchestrator core (state machine + Firestore)

**Spec**: specs/003-minion-orchestrator-core/spec.md

This plan resolves the spec's six Open Questions as Architecture Decisions (AD-1…AD-6),
then lays out files, phases, and test strategy. The deliverable is the **orchestration
spine**: nine stub steps wired into a Firestore-backed, lockable, idempotent run lifecycle
with Pydantic boundaries and structured logging. No real step logic (F-004+).

## Architecture Decisions

### AD-1: Run document keyed by date; `runId` is a ULID field (resolves OQ-1)
- **Choice**: The Firestore run document lives at `runs/{YYYY-MM-DD}` — the date is the
  document key and the idempotency key. `runId` is a **ULID** stored as a field on the doc
  (and on every step child), minted fresh on each attempt.
- **Rationale**: Date-as-key gives trivial overwrite-on-replay (constitution §2.7). A
  distinct ULID lets logs and run history disambiguate *which attempt* produced the current
  content, and is sortable by creation time. The PWA supervision target (FR-A1 "navigates
  with the new runId") resolves to the date-keyed doc; the ULID rides inside it.
- **Reconciliation**: The PRD/schema notation `runs/{runId}/steps/{stepName}` is loose —
  `{runId}` there denotes the *run document key*, which we bind to the date. This divergence
  is intentional and documented in the run model's docstring.
- **Alternatives**: `runId == date` (rejected — loses attempt identity); `date + attempt#`
  doc ids (rejected — breaks single-doc overwrite, needs a "latest" pointer).

### AD-2: Dedicated lock document with TTL reclaim, global single-flight (resolves OQ-2, OQ-3)
- **Choice**: A singleton `locks/minion` document acquired/released inside a Firestore
  **transaction**. Acquisition writes `{ runId, date, startedAt }`. A second invocation
  whose transaction finds a live lock aborts immediately with run status
  `aborted` / reason `already_running` and runs **no** steps. A lock is **stale** (and
  reclaimable in the same transaction) when its `startedAt` is older than `RUN_TIMEOUT`
  (20 min, constitution §2.6). The lock is released in a `finally` on both success and
  failure.
- **Rationale**: A dedicated lock doc keeps the guard orthogonal to run docs (a replay of a
  past date never trips the live-run guard). Global single-flight matches a one-operator
  daily pipeline ("no simultaneous runs"). TTL-by-`startedAt` recovers cleanly from a
  crashed run without a separate janitor.
- **Alternatives**: `status=running` scan over run docs (rejected — couples locking to run
  state, fuzzy stale recovery); per-date lock (rejected — allows two dates to race, no
  benefit here).

### AD-3: Firestore behind a port; in-memory fake for tests (resolves OQ-4)
- **Choice**: Define `RunStore` and `LockStore` **Protocols** (ports). `FirestoreRunStore` /
  `FirestoreLockStore` are the production adapters over `google-cloud-firestore`;
  `InMemoryRunStore` / `InMemoryLockStore` are hermetic fakes used by the whole test suite.
  The orchestrator depends only on the ports.
- **Rationale**: Hermetic, fast `build-minion` CI with no emulator/Java dependency. Keeps
  the orchestrator's logic (lifecycle, idempotency, lock semantics) testable in isolation.
- **Risk & mitigation**: The fake can drift from real Firestore transaction semantics. The
  fakes will model the two semantics F-003 actually relies on — atomic compare-and-set on
  the lock doc, and overwrite-by-key — and nothing more. Real-Firestore fidelity is
  exercised end-to-end later by F-007's deployed run.
- **Alternatives**: Firestore emulator (rejected for now — heavier CI; revisit if fake
  drift bites).

### AD-4: Defer the enforced run timeout to F-007; expose the cap as a shared constant (resolves OQ-5)
- **Choice**: F-003 does **not** add an internal wall-clock killer. The 20-min cap lives as
  `RUN_TIMEOUT` in `minion/config.py` and is reused by AD-2's stale-lock reclaim. Per-run
  and per-step `startedAt`/`endedAt` make overruns observable.
- **Rationale**: The real ceiling is the Cloud Run Job `timeout` setting (F-007). Duplicating
  it as a soft in-process timer now adds threading complexity for little gain — but the cap
  value must already exist because the lock TTL depends on it.

### AD-5: Minimal, spine-only schema growth (resolves OQ-6)
- **Choice**: Extend `shared/schema/run.json` with exactly what the spine needs, then
  `pnpm gen`:
  1. Add an optional run-level `error` (nullable string) — holds the failure/abort reason
     (e.g. `already_running`), symmetric with `RunStep.error`.
  2. Add a `StepName` enum (`gmail`, `jina`, `validate_input`, `assemble`, `generate`,
     `validate_output`, `imagen`, `github`, `publish`) and type `RunStep.name` to it — the
     nine-step set is fixed in this feature, so the contract should encode it.
  - No article/image/cost fields yet (F-004+ extend incrementally).
- **Rationale**: Keeps the PWA-facing contract tight without speculative fields. The
  `StepName` enum is shared so the future supervision UI (F-011) renders against the same
  canonical names.

### AD-6: Injected `Clock` + ULID generation for deterministic tests
- **Choice**: A `Clock` protocol (`now() -> datetime`, tz-aware Europe/Paris) with
  `SystemClock` (prod) and `FrozenClock` (tests). `runId` ULIDs are minted via the
  `python-ulid` library (new dependency). Timestamps and id minting are injected, never
  read from module-level `datetime.now()`.
- **Rationale**: Makes idempotency, ordering, and stale-lock tests deterministic without
  patching the stdlib.

## Affected Files

### New Files
| File | Purpose |
|------|---------|
| `minion/src/minion/__main__.py` | `python -m minion` entrypoint → delegates to `cli`. |
| `minion/src/minion/cli.py` | `click` group + `run --date YYYY-MM-DD` command; date parsing/validation; dependency wiring. |
| `minion/src/minion/config.py` | Constants: `RUN_TIMEOUT` (20 min), collection names (`runs`, `locks`), lock doc id (`minion`), `PARIS_TZ`. |
| `minion/src/minion/logging.py` | `python-json-logger` setup; `runId`/`step` binding helpers; the only sanctioned stdout boundary (T20 exempt). |
| `minion/src/minion/clock.py` | `Clock` protocol, `SystemClock`, `FrozenClock`; `new_run_id()` ULID helper. |
| `minion/src/minion/models.py` | Re-export generated `Run`/`RunStep`/`RunStatus`/`StepName`; internal `Lock` model; `AbortReason`/result types. |
| `minion/src/minion/store/__init__.py` | Package marker. |
| `minion/src/minion/store/ports.py` | `RunStore`, `LockStore` Protocols. |
| `minion/src/minion/store/firestore.py` | `FirestoreRunStore`, `FirestoreLockStore` adapters (transactional lock). |
| `minion/src/minion/store/memory.py` | `InMemoryRunStore`, `InMemoryLockStore` fakes for tests. |
| `minion/src/minion/steps/__init__.py` | `STEPS` ordered registry of the nine stubs. |
| `minion/src/minion/steps/base.py` | `Step` protocol, `StepContext`, `StepResult` dataclasses. |
| `minion/src/minion/steps/stubs.py` | Nine stub step bodies returning canned, schema-shaped payloads. |
| `minion/src/minion/orchestrator.py` | The state machine: acquire lock → write run → drive steps → finalize → release. |
| `minion/tests/test_orchestrator.py` | Happy path, idempotent replay, step-failure halt, run-doc shape. |
| `minion/tests/test_concurrency.py` | Abort-when-locked, lock released on success/failure, stale-lock reclaim. |
| `minion/tests/test_cli.py` | Invalid/missing `--date`, exit codes, end-to-end stub run. |
| `minion/tests/test_logging.py` | Structured JSON output carries `runId`; no bare `print`. |
| `minion/tests/conftest.py` | Fixtures: `FrozenClock`, in-memory stores, wired orchestrator. |

### Modified Files
| File | Change |
|------|--------|
| `shared/schema/run.json` | Add run-level `error`; add `StepName` enum, type `RunStep.name` to it (AD-5). |
| `shared/generated/{ts,veilleur_shared}/**` | Regenerated via `pnpm gen` (committed, CI-verified — do not hand-edit). |
| `minion/pyproject.toml` | Add `python-ulid>=2.0` dependency (AD-6). |
| `minion/src/minion/__init__.py` | Package docstring + minimal public exports (keep import-clean for the smoke test). |
| `minion/tests/test_smoke.py` | Keep, or fold into the new suites (it asserts the package imports). |

## Implementation Phases

### Phase 1: Contract + foundations
- Expand `run.json` (run-level `error`, `StepName` enum); run `pnpm gen`; verify
  `pnpm check:codegen` clean.
- `config.py` constants; `clock.py` (`Clock`/`SystemClock`/`FrozenClock` + ULID helper);
  `logging.py` structured-JSON setup.
- `models.py` re-exporting generated types + internal `Lock`/result models.
- *Foundation everything else imports.*

### Phase 2: Ports + adapters
- `store/ports.py` — `RunStore` (overwrite run, upsert step, finalize) and `LockStore`
  (transactional acquire-or-reclaim, release) Protocols.
- `store/firestore.py` — real adapters; lock acquire/reclaim/release in a Firestore
  transaction.
- `store/memory.py` — in-memory fakes modelling atomic lock compare-and-set + overwrite.
- *Tests for the fakes' lock semantics land with Phase 4.*

### Phase 3: State machine + steps
- `steps/base.py` (`Step`, `StepContext`, `StepResult`); `steps/stubs.py` (nine stubs);
  `steps/__init__.py` ordered `STEPS` registry.
- `orchestrator.py`: acquire lock (abort→`already_running` if live) → write `running` run
  doc with fresh ULID → drive steps writing per-step `running`→terminal child docs →
  step exception sets step `failure`, run `failure`, halts remainder → finalize run
  status/`endedAt` → release lock in `finally`.

### Phase 4: CLI, wiring, tests, CI
- `cli.py` (`run --date`, default today/Paris, invalid-date non-zero exit) + `__main__.py`;
  wire `SystemClock` + Firestore adapters in prod, fakes in tests.
- Full test suite (see Test Strategy) using in-memory stores + `FrozenClock`.
- Verify `uv run ruff check . && uv run ruff format --check . && uv run pyright &&
  uv run pytest` and `pnpm check:codegen` all green.

## Test Strategy
- **Mocking approach**: No mocks of Firestore. Hexagonal in-memory fakes (`InMemoryRunStore`,
  `InMemoryLockStore`) substituted via constructor injection; `FrozenClock` for deterministic
  timestamps/ULIDs. `click.testing.CliRunner` for the CLI. `caplog`/captured stdout for the
  logging assertions.
- **Happy paths**: All nine stubs execute in order; run doc has `runId` (ULID), `date`,
  `status=success`, `startedAt`/`endedAt`; nine step children each with terminal status and
  null `error`; built `Run` validates against the generated Pydantic model.
- **Error scenarios**: invalid `--date` exits non-zero before any store write; a step raising
  → that step `failure` + run `failure` + remaining steps not executed + lock released;
  Firestore-write failure path surfaces (no silent pass).
- **Edge cases**: replay same date overwrites run + step children (no duplicate/orphan, fresh
  ULID); second concurrent acquire aborts `already_running` with no step execution; stale lock
  (`startedAt` > `RUN_TIMEOUT`) is reclaimed; lock released after both success and failure.

## Risk & Complexity
- **Estimated complexity**: **Medium** (Large per roadmap sizing). Logic is concentrated in
  the lock transaction and lifecycle/idempotency; step bodies are trivial stubs.
- **Key risks**:
  1. In-memory fake diverging from real Firestore transaction semantics (AD-3) — mitigated by
     modelling only the two operations the spine uses; real fidelity proven in F-007.
  2. Lock correctness (stale reclaim races) — the highest-value test surface; covered by
     `test_concurrency.py`.
  3. `runId`/date reconciliation confusing later consumers — mitigated by AD-1 docstring +
     the `StepName`/key conventions in the shared schema.
- **New dependencies**: `python-ulid>=2.0` (runtime). To be called out in the PR description
  per CLAUDE.md conventions. Lockfile (`minion/uv.lock`) updated via `uv sync`.
