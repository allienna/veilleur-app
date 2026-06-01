# Tasks: Minion orchestrator core (state machine + Firestore)

**Plan**: specs/003-minion-orchestrator-core/plan.md
**Status**: Ready
**Total**: 18 tasks across 4 phases

Conventions (CLAUDE.md): Python 3.12 + Pydantic; `ruff` lint+format; `pyright` strict;
no `print` outside `logging.py` (ruff `T20`). Run all minion commands from `minion/`.
Schema is source-of-truth: edit `shared/schema/*.json`, never the generated output, then
`pnpm gen` (from repo root). Gate per task with the listed command; full gate is
`uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest`
plus `pnpm check:codegen` from root.

## Phase 1: Contract + foundations

- [x] **T-1.1**: Expand the shared run schema (AD-5)
  - **Do**: Edit `shared/schema/run.json`: add optional run-level `error` (nullable string,
    "Run-level failure/abort reason, e.g. already_running"). Add a `StepName` enum in
    `$defs` with the nine canonical values (`gmail`, `jina`, `validate_input`, `assemble`,
    `generate`, `validate_output`, `imagen`, `github`, `publish`) and change `RunStep.name`
    to `$ref` that enum. Update the `run.json` description to note the doc is keyed by date
    and `runId` is a ULID field (AD-1). Do not hand-edit generated files.
  - **Test**: from repo root `pnpm gen` succeeds, then `pnpm check:codegen` passes (no drift);
    confirm `shared/generated/veilleur_shared/run.py` now exposes a `StepName` enum and `Run.error`.

- [x] **T-1.2**: Add the `python-ulid` dependency (AD-6)
  - **Do**: Add `python-ulid>=2.0` to `minion/pyproject.toml` `[project].dependencies`;
    `cd minion && uv sync` to update `minion/uv.lock`.
  - **Test**: `cd minion && uv run python -c "import ulid; print(ulid.ULID())"` prints a ULID.

- [x] **T-1.3**: Config constants (`minion/src/minion/config.py`)
  - **Do**: Create `config.py` with `RUN_TIMEOUT` (`timedelta(minutes=20)`), `PARIS_TZ`
    (`ZoneInfo("Europe/Paris")`), `RUNS_COLLECTION = "runs"`, `LOCKS_COLLECTION = "locks"`,
    `LOCK_DOC_ID = "minion"`, and the ordered step-name tuple sourced from the generated
    `StepName`. Module-level constants only, no side effects.
  - **Test**: `cd minion && uv run pyright && uv run python -c "from minion import config; assert config.RUN_TIMEOUT.total_seconds()==1200"`.

- [x] **T-1.4**: Clock port + ULID helper (`minion/src/minion/clock.py`)
  - **Do**: Define a `Clock` Protocol (`now() -> datetime`, tz-aware in `PARIS_TZ`),
    `SystemClock` (prod), `FrozenClock` (tests, fixed/advanceable now), and
    `new_run_id() -> str` returning a ULID string.
  - **Test**: `cd minion && uv run pytest tests/test_clock.py` (new) — `FrozenClock.now()`
    returns the injected instant; `new_run_id()` returns distinct sortable 26-char strings.

- [x] **T-1.5**: Structured logging boundary (`minion/src/minion/logging.py`)
  - **Do**: Configure `python-json-logger` to emit JSON to stdout; provide
    `configure_logging()` and a helper to bind `runId` (and optional `step`) onto records
    (e.g. `LoggerAdapter` or filter). This module is the only sanctioned stdout boundary;
    add a `per-file-ignores` `T20` entry for it in `pyproject.toml` if any print fallback
    is used (mirror the existing spike entry).
  - **Test**: `cd minion && uv run pytest tests/test_logging.py` (new) — a captured record is
    valid JSON containing the bound `runId`.

- [x] **T-1.6**: Models module (`minion/src/minion/models.py`)
  - **Do**: Re-export generated `Run`, `RunStep`, `RunStatus`, `StepName` from the packaged
    `veilleur_shared` module (codegen output in `shared/generated/veilleur_shared`, added to
    `minion` as an editable uv path dependency). Add internal Pydantic models not in the
    shared contract: `Lock` (`run_id`, `date`, `started_at`) and a `StepResult`/`AbortReason`
    as needed. Document the date-key vs ULID `runId` split (AD-1).
  - **Test**: `cd minion && uv run pyright && uv run python -c "from minion.models import Run, StepName, Lock"`.

## Phase 2: Ports + adapters

- [x] **T-2.1**: Store ports (`minion/src/minion/store/ports.py`)
  - **Do**: Create `store/__init__.py` and `store/ports.py` defining `RunStore` Protocol
    (`write_run(run)`, `upsert_step(date, step)`, `finalize_run(date, status, ended_at, error)`)
    and `LockStore` Protocol (`acquire(lock) -> bool` with stale-reclaim semantics,
    `release(date)`), keyed by date per AD-1/AD-2. Pure interfaces, no implementation.
  - **Test**: `cd minion && uv run pyright` (Protocols type-check; no runtime test yet).

- [x] **T-2.2**: In-memory fakes (`minion/src/minion/store/memory.py`)
  - **Do**: Implement `InMemoryRunStore` (dict keyed by date, overwrite-on-write, child step
    list) and `InMemoryLockStore` modelling atomic compare-and-set: `acquire` succeeds when
    no live lock OR the existing lock's `startedAt` is older than `RUN_TIMEOUT` (reclaim);
    `release` clears it. Use an injected `Clock` for the staleness check.
  - **Test**: `cd minion && uv run pytest tests/test_store_memory.py` (new) — overwrite
    replaces by date; `acquire` blocks a second live acquire and reclaims a stale lock;
    `release` frees it.

- [x] **T-2.3**: Firestore adapters (`minion/src/minion/store/firestore.py`)
  - **Do**: Implement `FirestoreRunStore` (`runs/{date}` doc + `runs/{date}/steps/{name}`
    children, overwrite semantics) and `FirestoreLockStore` using a Firestore
    **transaction** for `acquire` (create-or-reclaim-if-stale on `locks/minion`) and
    `release`. Construct from a `google.cloud.firestore.Client`. No new business logic
    beyond the ports.
  - **Test**: `cd minion && uv run pyright` (strict types against the Firestore client);
    behavioural coverage is via the in-memory fakes (AD-3) — no emulator in CI.

## Phase 3: State machine + steps

- [x] **T-3.1**: Step contracts (`minion/src/minion/steps/base.py`)
  - **Do**: Create `steps/__init__.py` and `steps/base.py` with `StepContext` (carries
    `runId`, `date`, `clock`, bound logger, and a payload bag), `StepResult`, and a `Step`
    Protocol (`name: StepName`, `run(ctx) -> StepResult`).
  - **Test**: `cd minion && uv run pyright`.

- [x] **T-3.2**: Nine stub steps (`minion/src/minion/steps/stubs.py`)
  - **Do**: Implement nine stub `Step`s, one per `StepName`, each logging via the bound
    logger and returning canned, schema-shaped payloads (no external calls). Wire them, in
    canonical order, into a `STEPS` tuple in `steps/__init__.py`.
  - **Test**: `cd minion && uv run pytest tests/test_steps.py` (new) — `STEPS` has nine
    entries in canonical order; each stub returns a `StepResult` without raising.

- [x] **T-3.3**: Orchestrator lifecycle skeleton (`minion/src/minion/orchestrator.py`)
  - **Do**: Implement `run_pipeline(date, *, run_store, lock_store, clock, steps)`: mint a
    ULID `runId`; acquire the lock (on failure, write an `aborted`/`already_running` run doc
    and return without executing steps); write the `running` run doc; release the lock in a
    `finally` (success and failure). Leave step execution to T-3.4.
  - **Test**: `cd minion && uv run pytest tests/test_concurrency.py::test_abort_when_locked`
    (new) — second call aborts `already_running`, runs no steps; lock released afterward.

- [x] **T-3.4**: Drive steps + per-step Firestore writes (AC-3, AC-7)
  - **Do**: In `run_pipeline`, iterate `STEPS`: write each step child `running` →
    terminal (`success`) with `startedAt`/`endedAt`; on a step exception set that step
    `failure` with the error, mark the run `failure`, and **halt** remaining steps. Finalize
    the run doc `status`/`endedAt` (+ run-level `error` on failure).
  - **Test**: `cd minion && uv run pytest tests/test_orchestrator.py` (new) — happy path
    writes nine terminal step children + a `success` run doc; an injected failing step yields
    that step `failure`, run `failure`, and no subsequent step children.

- [x] **T-3.5**: Idempotent replay + stale-lock reclaim (AC-4, AC-6)
  - **Do**: Ensure replaying the same date overwrites the run doc and all step children with
    a fresh ULID and no duplicates/orphans (rely on date-keyed overwrite + clear-children on
    start). Confirm the orchestrator path exercises `LockStore` stale-reclaim.
  - **Test**: `cd minion && uv run pytest tests/test_orchestrator.py::test_replay_overwrites tests/test_concurrency.py::test_stale_lock_reclaimed`.

## Phase 4: CLI, wiring, tests, CI gate

- [x] **T-4.1**: CLI command + entrypoint (`minion/src/minion/cli.py`, `__main__.py`)
  - **Do**: `click` group with `run --date YYYY-MM-DD` (default = today in `PARIS_TZ`);
    validate the date format and exit non-zero with a clear message before any store write.
    Wire `SystemClock` + Firestore adapters for real runs. Add `__main__.py` so
    `python -m minion` works. Configure logging at startup.
  - **Test**: `cd minion && uv run pytest tests/test_cli.py` (new, `CliRunner`) — invalid
    `--date` exits non-zero with a message and no store writes; a wired stub run exits 0.

- [x] **T-4.2**: Test fixtures (`minion/tests/conftest.py`)
  - **Do**: Add fixtures: `FrozenClock`, `InMemoryRunStore`, `InMemoryLockStore`, and a
    `wired_run` helper invoking `run_pipeline` with the fakes + stub `STEPS`. Refactor the
    Phase 2–3 tests to consume them where useful.
  - **Test**: `cd minion && uv run pytest` (whole suite green via fixtures).

- [x] **T-4.3**: Logging carries runId end-to-end (AC-9)
  - **Do**: Assert that during a full stub run every emitted record is JSON and carries the
    run's `runId` (and `step` where applicable); assert no bare `print` (ruff `T20` already
    enforces statically — this is the runtime check).
  - **Test**: `cd minion && uv run pytest tests/test_logging.py::test_run_logs_carry_runid`.

- [x] **T-4.4**: Full gate + smoke-test reconciliation (AC-2, AC-8, AC-10)
  - **Do**: Keep or fold `tests/test_smoke.py` into the suite. Confirm a built `Run` validates
    against the generated Pydantic model. Run the complete gate and fix any lint/format/type
    fallout.
  - **Test**: `cd minion && uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest`
    all pass, and from repo root `pnpm check:codegen` passes.
