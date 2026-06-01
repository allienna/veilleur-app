# Review: Minion orchestrator core (state machine + Firestore)

**Spec**: specs/003-minion-orchestrator-core/spec.md
**Plan**: specs/003-minion-orchestrator-core/plan.md
**Reviewed**: 2026-06-01
**Verdict**: **Pass with notes**

## Task completion

18/18 tasks checked across 4 phases. No scope dropped. The Python import-path wiring that
F-002's review deferred to F-003 is now in place (T-1.6).

## Quality gates

| Gate | Result |
|------|--------|
| `uv run ruff check .` | ✅ pass |
| `uv run ruff format --check .` | ✅ pass |
| `uv run pyright` (strict) | ✅ 0 errors |
| `uv run pytest` | ✅ 32 passed |
| `pnpm check:codegen` | ✅ in sync (regen stable) |
| `pnpm lint` / `typecheck` / `build` (pwa, trigger-api) | ✅ pass (StepName/error schema change consumed cleanly) |
| `pnpm check:email` | ✅ pins identical |
| `python -m minion run --help` | ✅ entrypoint wired |

## Acceptance criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC-1 nine stub steps, exit 0 | ✅ | `test_cli.py::test_wired_stub_run_exits_zero`; `python -m minion` entrypoint verified |
| AC-2 run doc validates against `run.json` | ✅ | `test_orchestrator.py::test_run_has_ulid_runid_and_validates_against_schema` (round-trips `Run.model_validate`) |
| AC-3 per-step `runs/{date}/steps/{name}` records | ✅ | `test_happy_path_writes_nine_success_steps`; subcollection modelled in stores |
| AC-4 replay overwrites, no orphans | ✅ | `test_replay_overwrites_with_fresh_runid_no_orphans` |
| AC-5 concurrent abort `already_running`, no steps | ✅ | `test_concurrency.py::test_abort_when_locked_runs_no_steps` |
| AC-6 lock released on success AND failure | ✅ | `test_lock_released_after_success` / `_after_failure` |
| AC-7 step failure marks run failure + halts | ✅ | `test_step_failure_marks_run_failure_and_halts` |
| AC-8 Pydantic boundaries; codegen in sync | ✅ | generated `veilleur_shared` models used throughout; `check:codegen` green |
| AC-9 structured JSON logs carry `runId`; no bare `print` | ✅ | `test_run_logs_are_json_and_carry_runid`; ruff `T20` static guard |
| AC-10 full gate + happy/replay/concurrency/failure coverage | ✅ | 32 tests across 8 files |

## Architecture decisions — as built

All six plan ADs implemented as specified: date-keyed doc + ULID `runId` field (AD-1);
`locks/minion` singleton with 20-min TTL stale-reclaim, global single-flight (AD-2);
hexagonal ports with in-memory fakes as the test substrate (AD-3); 20-min cap as a shared
constant, no in-process timeout (AD-4); minimal schema growth — run-level `error` + a
`StepName` enum (AD-5); injected `Clock` + ULID (AD-6).

## Notes / deviations (none blocking)

1. **Generated-Python import path established (cross-cutting).** F-002 left the generated
   Pydantic "importable by the Minion" without wiring. This feature: renamed the codegen
   output dir `generated/python` → `generated/veilleur_shared`, added `shared/pyproject.toml`
   packaging it as `veilleur_shared`, and added it to `minion` as an editable `tool.uv.sources`
   path dependency. `gen-py.mjs` also gained `--use-annotated` so constrained fields (e.g.
   `Run.date`) resolve to `str` under strict pyright. This is the right long-term answer and
   sets up F-007/F-008, but it widened F-003's footprint into `shared/`.

2. **Abort path does not persist (refines plan T-3.3).** The plan said the aborted second
   invocation would "write an aborted run doc". It deliberately does **not** — writing to
   `runs/{date}` would clobber the live run's own document. It returns an in-memory aborted
   `Run` and touches no storage. Correctness improvement over the plan wording.

3. **`release(run_id)` not `release(date)`.** The lock is released only by its owner,
   preventing a reclaiming run from wiping a different run's lock.

4. **`firestore.py` is `# pyright: basic`.** The google-cloud-firestore stubs are incomplete
   (already acknowledged in `pyproject` `reportMissingTypeStubs=false`). The single SDK-boundary
   adapter is dropped to basic checking; its behaviour is covered by the in-memory fakes and is
   unverified against real Firestore until F-007.

5. **Internal `Lock` model uses snake_case.** It is Minion-internal (the PWA never reads
   `locks/minion`), so it avoids the camelCase the PWA-facing contract types carry.

## Follow-ups for later features (not F-003 scope)

- **F-007 container packaging.** `minion` now has an editable path dependency on `../shared`
  and `build_stores()` constructs a real `firestore.Client()`. The Minion image must include
  `shared/` (or vendor the generated package) and provide GCP credentials. Flag for the F-007
  Dockerfile.
- **Real-Firestore fidelity.** Lock-transaction and overwrite semantics are proven only via
  the in-memory fakes (AD-3). F-007's first deployed run is the real-Firestore proof.
- **Step payloads are placeholders.** Stub canned data is intentionally minimal; F-004+ define
  the real inter-step payload shapes.

**Conclusion**: Implementation matches the spec and plan; all 10 ACs met with tests; every
quality gate green. Verdict **Pass with notes** — the notes are deliberate, documented
refinements plus F-007 packaging follow-ups, none blocking merge.
