# Review: PWA supervision + manual trigger

**Track**: 011-pwa-supervision-trigger
**Reviewed**: 2026-06-03
**Spec**: specs/011-pwa-supervision-trigger/spec.md
**Plan**: specs/011-pwa-supervision-trigger/plan.md
**Verdict**: **Pass with notes** (real-time latency + on-device flow deferred to F-013; production needs `VITE_TRIGGER_API_URL`)

## 1. Task completion
All 18 tasks across 5 phases are checked in tasks.md. Implemented surface:
- **shared**: `shared/schema/run.json` gains nullable `costUsd`/`tokens`; regenerated TS + Pydantic (committed).
- **minion**: `generate/runner.py` switches to `claude --output-format json` and unwraps the envelope (`_parse_output`); `generate/models.py` adds `GenerateInvocation`; `generate/ports.py`/`fakes.py` follow; `steps/generation.py` accumulates cost across attempts; `orchestrator.py` threads it to `finalize_run`; `store/{ports,memory,firestore}.py` persist + read back `costUsd`/`tokens`. `config.CLAUDE_CMD` gains `--output-format json`.
- **rules**: `firestore.rules` adds `runs/{date}` + `runs/{date}/steps/{step}` read-allow / write-deny (reuses `isAllowedOperator()`).
- **pwa**: `data/runs.ts` (two-listener assemble + history), `data/trigger.ts`, `lib/{useRun,useNow,runStatus}.ts`, `lib/format.ts` (+`formatDuration`), components `StatusPill`/`RunStepRow`/`RunTimeline`/`RunNowButton`, routes `Supervision.tsx` + `Run.tsx` (placeholder deleted), `router.tsx` + `Today.tsx` wiring, `config.ts`/`env.d.ts`/`.env.example` (`TRIGGER_API_URL`).
- **tests**: `minion/tests/test_run_cost.py`, `pwa/src/data/{runs,trigger}.test.ts`, `pwa/src/components/supervision.test.tsx`, extended `firestore.rules.test.ts` + `test_generate_runner.py` + fixtures.

## 2. Quality gates
| Gate | Command | Result |
|---|---|---|
| Lint (TS) | `eslint .` (pwa + trigger-api) | ✅ pass (the root `pnpm lint` is mangled by the RTK proxy; ran per-package) |
| Types (TS) | `pnpm typecheck` | ✅ pass (3 workspaces) |
| Build | `pnpm --filter @veilleur/pwa run build` | ✅ built (see Note 1) |
| Tests (PWA) | `pnpm --filter @veilleur/pwa test` | ✅ 67/67 (was 38; +29 new) |
| Rules | `pnpm test:rules` | ✅ 13/13 (was 6; +7 new for `runs`) |
| Codegen | `pnpm check:codegen` | ⏸ idempotent; drift is only the two intended generated files, committed at ship (Note 2) |
| Email pin | `pnpm check:email` | ✅ identical across all 3 locations (no new pin) |
| Minion | `ruff` + `format` + `pyright` + `pytest` | ✅ ruff/format clean, pyright 0 errors, 153/153 (+ the 2 gated integration tests deselected) |
| TS hygiene | grep `any` / `@ts-ignore` in new files | ✅ none |

## 3. Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 step changes reflect ≤2s | ✅ logic / ⏸ on-device | `onSnapshot` real-time listeners (`subscribeRun`); wall-clock latency is a device-pass check (F-013). |
| AC-2 current step + live elapsed + error visible | ✅ | `RunStepRow` + `useNow` tick; `ErrorBanner` in `RunTimeline`. |
| AC-3 9 steps in order, pending, running pulse, static under reduced-motion | ✅ | `supervision.test.tsx` "all nine in canonical order", "pending → dash", "motion-safe only". |
| AC-4 ≥7 history newest-first w/ status, date, duration (cost) | ✅ | `Supervision.tsx`; `runs.test.ts` "newest-first by document id"; cost "—" when null. |
| AC-5 `runs` read-allow/write-deny; non-allowed rejected | ✅ | `firestore.rules.test.ts` — 7 `runs` cases (operator read run+step, non-allowed/unverified/unauth denied, writes denied). |
| AC-6 Run now → Bearer ID token → navigate to `/runs/{date}` | ✅ | `trigger.test.ts` (Bearer + body + 202→date); `supervision.test.tsx` "triggers and reports the returned date". |
| AC-7 disabled while today's run running | ✅ | `supervision.test.tsx` "disabled with a caption while a run is in progress"; Today derives via `useRun`. |
| AC-8 dual-encoded status + WCAG AA | ✅ | `StatusPill` colour+verb (6 cases tested); tokens are the DESIGN §1 AA-verified `color.status.*`. |
| AC-9 lint/typecheck/build/tests + `check:email` | ✅ | §2. |

## 4. Spec conformance notes
- **Two-listener assembly** (plan AD-1): the PWA reconstructs `Run` from the run doc + `steps` subcollection (steps are *not* embedded — they're subcollection docs), mirroring the Minion's `get_run`. Tolerant of either snapshot arriving first (`haveRun` gate). ✅
- **Date-keyed model** (spec Q2): live view is `/runs/:date`; trigger navigates on the returned `date`, not the Cloud Run `execution`. ✅
- **Cost capture** (spec Q1 / plan AD-5): real `total_cost_usd` + `usage`, summed across validation retries, USD native; `null` when `generate` never runs (skipped/early-fail) or the CLI omits usage. The graceful fallback is honored — a non-envelope or non-numeric payload degrades to `null`, never crashes. ✅
- **Allowed-email invariant** (constitution §2.1): the new rule reuses `isAllowedOperator()`; no new pin location; `check:email` green. ✅
- **A11y** (DESIGN §1/§5): status never colour-only; `running` pulse gated by `motion-safe:` (static dot under reduced motion, also covered by the global reduced-motion CSS). ✅

## 5. Review fixes applied
An independent code review surfaced three items, all fixed and covered before this verdict:
1. **`subscribeRun` stale-callback race** (plan Risk §2) — added an `active` flag set false on teardown so a steps snapshot flushed between the two `unsubscribe()` calls can't `setState` post-unmount.
2. **`_parse_output` unguarded coercion** — a non-numeric `total_cost_usd`/`usage` now degrades to `null` (the AD-5 fallback) instead of raising `ValueError`; covered by `test_non_numeric_cost_degrades_to_none`.
3. **Today held listeners unnecessarily** — `useRun(date, enabled)` now subscribes only in the no-article state (where the trigger button renders), freeing two Firestore reads on the reading view.

## Notes / follow-ups
1. **Bundle warning (pre-existing)**: the build warns the main chunk >500 kB — dominated by `firebase`, predates this track. The new supervision code is lazy-chunked (`Supervision`, `Run`, `StatusPill`, `runs`, `useRun`). No action for F-011; code-splitting is an F-013 concern.
2. **Codegen drift**: `check:codegen` fails locally only because the regenerated `run.ts`/`run.py` aren't committed yet; the diff is exactly the intended `costUsd`/`tokens` additions and is idempotent. Committed at ship → CI green.
3. **Production config**: `VITE_TRIGGER_API_URL` must be set in the PWA build env (e.g. CI/Firebase Hosting) to the deployed trigger-api URL, else "Run now" POSTs to `undefined/trigger`. Documented in `.env.example`; wire in the F-007/deploy config.
4. **On-device verification (F-013)**: real-time ≤2s latency (AC-1) and the trigger→live-view flow on a real iPhone are device-pass checks, consistent with F-009 AC-9 / F-010 AC-7 deferrals.
5. **No new dependencies**: feature uses existing `firebase`/`react-router-dom`/Vitest. Only new config key, no package.
