# Spec: Minion orchestrator core (state machine + Firestore)

**Track ID**: 003-minion-orchestrator-core
**Roadmap ref**: F-003
**Status**: Complete (reviewed Pass-with-notes; all 10 ACs met)
**Created**: 2026-06-01
**Branch**: feat/003-minion-orchestrator-core
**PRD sections**: FR-A1, FR-A2 (skeleton), §6 Error handling, §6 Observability
**Depends on**: F-002 — Monorepo scaffold + shared types (**Complete**, merged #6)

## Context

The Minion is the daily tech-watch pipeline: a one-shot Cloud Run Job that runs nine
steps (Gmail pull → Jina scrape → schema validation → context assembly →
`claude -p /generate` → output validation → Imagen → GitHub commit → Firestore + web
push) and writes every step's state to Firestore so the PWA can supervise the run live.

F-003 builds the **skeleton that holds those nine steps** — the orchestration spine —
**without any real business logic**. Each step is a stub returning canned data. What this
feature delivers is the part that is genuinely hard and must be right before any step
matters: the run lifecycle, the Firestore state model, the concurrency guard, date-keyed
idempotency, Pydantic boundaries, and structured logging. F-004 onward replaces stubs
with real implementations one step at a time, against a spine that already enforces the
constitution's run-level invariants (principles 6–9).

The shared `run.json` / `run-status.json` schemas (F-002) are deliberately minimal and
name F-003 as the place "the full model lands". This feature owns expanding that contract
to whatever the live run document actually needs, then regenerating the committed TS +
Pydantic output via `pnpm gen`.

## User Stories

- As the **operator**, I want `python -m minion run --date YYYY-MM-DD` to execute a full
  (stubbed) pipeline locally so I can exercise the spine without deploying.
- As the **operator**, I want a replayed run for the same date to cleanly overwrite the
  prior run so re-running after a failure never produces duplicate articles or documents.
- As the **operator**, I want a second concurrent invocation to abort immediately
  (`aborted: already_running`) so two pipelines can never race on the same outputs.
- As the **PWA supervision view** (future F-011 consumer), I want each step to write
  `runs/{date}/steps/{stepName}` with `status / started_at / ended_at / error?` so a live
  listener can render run progress. (Per AD-1 the run document is keyed by `date`; `runId`
  is a ULID field, not the document key.)
- As a **developer**, I want every cross-boundary value to pass through a Pydantic model
  validated against the shared JSON Schema so a malformed run document fails loudly at the
  boundary, not silently downstream.
- As a **developer/operator**, I want structured JSON logs carrying `runId` on stdout so
  Cloud Logging can correlate every line of a run.

## Functional Requirements

### FR-1: CLI entrypoint
`python -m minion run --date YYYY-MM-DD` runs the pipeline for the given date. `--date`
defaults to today in Europe/Paris when omitted. Invalid date format exits non-zero with a
clear message before any Firestore write. The module is invokable as `python -m minion`
(real `__main__`), matching the roadmap's stated command shape.

### FR-2: Nine-step state machine
The orchestrator drives a fixed, ordered sequence of nine named steps. Each step is a
**stub** in this feature: it logs, writes its `running` → terminal state to Firestore, and
returns canned data of the right shape. The step list and canonical names are fixed here so
later features only swap the body, never the wiring. Proposed canonical step names (see
Open Questions): `gmail`, `jina`, `validate_input`, `assemble`, `generate`,
`validate_output`, `imagen`, `github`, `publish`.

A step that raises sets its own status to `failure` with the error message, marks the run
`failure`, and halts the remaining steps (no partial silent continuation).

### FR-3: Firestore run document + per-step children
On start, the orchestrator writes a run document at `runs/{date}` (keyed by date per AD-1;
`runId` is a ULID field on the doc) with `runId`, `date`, `status=running`, `startedAt`, and
an (initially empty / pending) step list. As each step executes it writes
`runs/{date}/steps/{stepName}` with `status`, `startedAt`, `endedAt`, and `error?` (null on
success). On completion the run document's `status` and `endedAt` are finalized. Every write
conforms to the shared schema (FR-6).

### FR-4: Date-keyed idempotency (constitution §2.7)
Runs are idempotent by `date`. Replaying date `D` overwrites the prior run's document and
all per-step children cleanly — never duplicating or orphaning documents. The Firestore
document identity is derived deterministically from the date (see Open Questions on
`runId` ↔ date relationship), so a second run for `D` lands on the same path.

### FR-5: Concurrency guard (constitution §2.8)
A Firestore-based lock prevents simultaneous runs. While a run is in flight, a second
invocation acquires no lock and aborts immediately, writing/leaving status
`aborted: already_running` (the run does **not** execute its steps). The lock is released
on run completion **and** on failure (no permanent deadlock after a crash — see Open
Questions on stale-lock handling).

### FR-6: Pydantic boundaries + schema sync (constitution §4)
Every I/O boundary (the run document, step records, CLI args, step return payloads) is a
Pydantic model. The run/step models are the generated Pydantic types from
`shared/generated/veilleur_shared/` (packaged as `veilleur-shared`), sourced from
`shared/schema/run.json`. This feature **expands**
`run.json` (and `run-status.json` if needed) to the full live shape and regenerates via
`pnpm gen`; `pnpm check:codegen` must pass (committed output not drifted).

### FR-7: Structured logging with runId (PRD §6 Observability)
All run output is structured JSON to stdout, every line tagged with `runId` (and step name
where applicable). No bare `print` outside the logging boundary (constitution §4). Logs are
the local mirror of the Firestore step state for correlation in Cloud Logging.

### FR-8: Run-level wall-clock awareness (constitution §2.6)
The 20-minute hard timeout is ultimately a Cloud Run Job setting (F-007). F-003 records
enough timing (`startedAt`/`endedAt` per run and per step) to make overruns observable.
Whether the orchestrator also enforces an internal soft wall-clock guard is an Open
Question.

## API Endpoints Involved

| Source API | Method | Path | Purpose |
|------------|--------|------|---------|
| Cloud Firestore (Native) | write | `runs/{date}` | Run document (keyed by date; `runId` is a ULID field — AD-1). |
| Cloud Firestore (Native) | write | `runs/{date}/steps/{stepName}` | Per-step observable state. |
| Cloud Firestore (Native) | transaction | `locks/minion` | Global single-flight concurrency guard (AD-2). |

No external HTTP APIs are called in F-003 — Gmail, Jina, Imagen, and GitHub are stubbed and
land in F-004–F-006. Firestore access uses `google-cloud-firestore` under the Minion SA's
`roles/datastore.user` binding (PRD §Security).

## Error Scenarios

| Scenario | Expected handling (PRD §6) |
|----------|----------------------------|
| Invalid `--date` | Exit non-zero with a clear message before any Firestore write. |
| Firestore write fails | Critical: retry (count TBD `/plan`), then hard-fail the run; surface in logs. Constitution §2.9 — no silent failure. |
| A step raises | Step → `failure` with error; run → `failure`; remaining steps skipped; lock released. |
| Second concurrent invocation | Abort immediately, `aborted: already_running`; do not run steps. |
| Replay of an existing date | Overwrite prior run document + step children cleanly (idempotent). |
| Stale lock from a crashed prior run | Must not deadlock future runs (mechanism — Open Question). |

## Acceptance Criteria

- [ ] AC-1: `python -m minion run --date 2026-06-01` executes all nine stub steps and exits 0.
- [ ] AC-2: The run document at `runs/{date}` has `runId`, `date`, `status`, `startedAt`,
      `endedAt`, and validates against `shared/schema/run.json`.
- [ ] AC-3: Each step writes `runs/{date}/steps/{stepName}` with `status`, `startedAt`,
      `endedAt`, `error?` (null on success).
- [ ] AC-4: Replaying the same `--date` overwrites the prior run + step children with no
      duplicate or orphaned documents.
- [ ] AC-5: A second invocation while one is in flight aborts with `aborted: already_running`
      and does not execute steps.
- [ ] AC-6: The concurrency lock is released after both successful **and** failed runs.
- [ ] AC-7: A step raising an exception sets that step `failure`, marks the run `failure`,
      and halts remaining steps.
- [ ] AC-8: All run/step values flow through Pydantic models; `pnpm check:codegen` passes
      (schema and committed generated output in sync).
- [ ] AC-9: All log output is structured JSON on stdout, each line carrying `runId`; no bare
      `print` outside the logging boundary.
- [ ] AC-10: `uv run ruff check . && uv run ruff format --check . && uv run pyright &&
      uv run pytest` all pass; tests cover happy path, replay/idempotency, concurrency-abort,
      and step-failure halt (Firestore emulator or fake — see Open Questions).

## Out of Scope

- Real implementations of any step (Gmail, Jina, validation, `/generate`, Imagen, GitHub,
  web push) — those are F-004, F-005, F-006, F-012.
- Cloud Run Job packaging, Cloud Scheduler, and the enforced 20-min job timeout — F-007.
- `trigger-api` and manual triggering — F-008.
- Per-run hard caps enforcement (50 newsletters / 100 links / token budgets) — lands with
  the real steps that produce those quantities (F-004+).
- Web push delivery — F-012 (the `publish` step stub only records intent here).

## Open Questions

1. **`runId` ↔ date.** Idempotency is date-keyed. Options: (a) Firestore doc id **is** the
   date (`runs/2026-06-01`), `runId == date` — simplest overwrite semantics; (b) doc id is
   the date but `runId` is a separate ULID/uuid stored in the doc; (c) doc id is `date` +
   attempt counter. Recommendation: **(a)** unless a reason to distinguish run attempts
   surfaces. Decide in `/plan`.
2. **Lock mechanism + stale-lock recovery.** A dedicated `locks/{singleton|date}` doc held
   in a Firestore transaction vs a `status=running` guard on the run doc itself. How is a
   lock from a crashed run reclaimed — TTL on the lock doc, or "running + startedAt older
   than the 20-min cap is reclaimable"? Decide in `/plan`.
3. **Lock granularity.** Global single-flight (one Minion run at a time, ever) vs per-date.
   For a one-operator daily pipeline, global single-flight matches "no simultaneous runs"
   — confirm.
4. **Test Firestore.** Firestore emulator (real client, hermetic, needs the emulator in CI)
   vs an in-memory fake/abstraction. Affects the `build-minion` CI job. Decide in `/plan`.
5. **Internal wall-clock guard (FR-8).** Does F-003 enforce a soft internal timeout, or
   defer entirely to the Cloud Run Job setting in F-007? Recommendation: defer; only record
   timing here.
6. **Schema expansion scope.** How far to grow `run.json` now — add article/image/cost
   fields the later steps will populate, or grow it incrementally per feature? Recommendation:
   add only fields the **spine** needs now (run + step lifecycle), let F-004+ extend.
