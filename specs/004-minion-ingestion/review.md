# Review: Minion ingestion (Gmail + Jina)

**Spec**: specs/004-minion-ingestion/spec.md
**Plan**: specs/004-minion-ingestion/plan.md
**Reviewed**: 2026-06-01
**Verdict**: ✅ **Pass with notes**

## Task completion

All 16 tasks across 3 phases are checked in `tasks.md`. Implementation spans 12 new source/
test files + 7 modified files, with no changes to `shared/`, the allowed-email pins, the
spike, or the PWA/trigger-api workspaces.

## Quality gate (from CLAUDE.md)

| Check | Result |
|-------|--------|
| `uv run ruff check .` | ✅ All checks passed |
| `uv run ruff format --check .` | ✅ 50 files already formatted |
| `uv run pyright` | ✅ 0 errors, 0 warnings |
| `uv run pytest` | ✅ 73 passed (was 32 at baseline; +41 ingestion tests) |
| No bare `print` (T20) | ✅ clean |
| Shared schema / `pnpm check:codegen` | ✅ untouched (AD-6 — ingestion data stays Minion-internal) |

## Acceptance criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC-1 — `gmail` fetch (24h window, denylist, 50-cap, structured) | ✅ | `ingest/gmail.py` + `steps/ingestion.py:GmailStep`; `test_gmail_client` (window query, 50-cap), `test_gmail_step` (denylist, dedupe) |
| AC-2 — URLs deduped + capped at 100, logged | ✅ | `GmailStep` dedupe + `MAX_URLS` truncation log; `test_gmail_step` (dedupe, cap) |
| AC-3 — `jina` scrapes each URL, per-source outcome | ✅ | `ingest/jina.py`; `test_jina_client` (success, prefix, outcomes) |
| AC-4 — paywalled excluded from OK set | ✅ | `SourceSet.ok_count`; `test_jina_client` (paywall), `test_ingestion_pipeline` (paywall) |
| AC-5 — ≥50% AND ≥5 gate, else hard-fail w/ shortfall | ✅ | `ValidateInputStep`; `test_validate_input` (boundary/count/fraction), pipeline `3/12` |
| AC-6 — empty mailbox → `skipped: no_sources`, halts, non-failure | ✅ | `StepResult.terminal_status` (AD-3) + orchestrator; `test_orchestrator`, `test_ingestion_pipeline` (3 steps, skipped) |
| AC-7 — Gmail auth failure → step + run `failure`, clear error | ✅ | `test_gmail_step` (raise propagates), `test_gmail_client` (auth), orchestrator failure-halt path |
| AC-8 — Jina rate-limit retried w/ backoff; persistent → `failed`, no crash | ✅ | `JinaReaderClient` retry/backoff; `test_jina_client` (429-then-success, persistent 5xx → failed) |
| AC-9 — Pydantic boundaries; codegen in sync | ✅ | `ingest/models.py`; schema unextended so codegen unaffected |
| AC-10 — full gate + 6-scenario matrix | ✅ | gate green; `test_ingestion_pipeline` covers happy/threshold-pass/threshold-fail/skip/paywall/denylist |

## Notes (non-blocking — burn-in / empirical follow-ups for F-013)

1. **24h window semantics (AD-4).** The window is the calendar day `[date 00:00, date+1d
   00:00)` in Paris, as approved. At a 06:00 run this captures only `date`'s early hours and
   misses the prior evening's newsletters; an operationally truer "last 24h" might anchor to
   `[date-1, date)`. Matches the approved plan; trivially adjustable in `_window_query`. Flag
   for burn-in observation.
2. **Paywall markers not empirically confirmed (AD-9).** `PAYWALL_MARKERS` holds plausible
   substrings and a test fixture pins one, but no real Jina paywalled response was probed
   (no network in the build). Confirm against a real paywalled URL during burn-in and update
   the markers + fixture.
3. **Jina deadline (AD-7).** Enforced via `as_completed(timeout=...)` + `shutdown(wait=False,
   cancel_futures=True)`; in-flight requests aren't truly interrupted but the process won't
   block. Acceptable for a one-shot job; revisit if a hung request ever dominates wall-clock.
4. **URL-extraction heuristic (AD-8).** Conservative denylist of non-article links; expected
   to need tuning against real newsletters during burn-in.

## Conclusion

The feature meets all 10 acceptance criteria with a green quality gate and a hermetic
(no-network) test suite. The notes are empirical/tuning items deferred to burn-in (F-013), not
correctness defects. **Cleared to proceed to QA and ship.**
