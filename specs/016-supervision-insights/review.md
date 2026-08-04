# Review: Supervision insights

**Date**: 2026-08-04
**Reviewer**: Claude Code (automated)

## Task Completion
- Total: 9 | Completed: 9 | Blocked: 0

## Acceptance Criteria
| # | Criterion | Status | Notes |
|---|---|---|---|
| AC-1 | Trends view shows rolling-window success rate matching burn-in-log.md's counting rule | PASS | `computeTrends` (trends.ts) excludes `skipped`/`aborted` from both numerator/denominator; tested in `trends.test.ts`. |
| AC-2 | Trends view shows cumulative + average cost, null-safe | PASS | `computeTrends.cumulativeCostUsd`/`averageCostUsd`; null costs excluded from average only, tested. |
| AC-3 | Trends view shows failure-cause breakdown | PASS | `computeTrends.failureBreakdown` via `classifyFailure`; rendered as "top cause" `TrendStat` in `Supervision.tsx`. |
| AC-4 | Failed/warned run detail shows parsed diagnostic when error matches known shape, raw string always visible | PASS | `RunTimeline` renders `ErrorBanner` (raw) + a structured summary line when `parseInsufficientSources` matches; falls back silently otherwise. Tested in `supervision.test.tsx`. |
| AC-5 | Auth-related failure shows re-auth runbook link | PASS | Pre-existing from F-011/F-013 (`isAuthFailure` + `reauthAction`), unchanged by this feature — confirmed still wired. |
| AC-6 | `/runs/:date` for a past, non-live date renders full step timeline incl. per-step error | PASS | `RunStepRow` now renders `step.error` (was the one real gap); `/runs/:date` route itself was already date-agnostic per F-011. Tested. |

## Architecture Compliance
| Decision | Followed? | Notes |
|---|---|---|
| AD-1 (client-side trends from existing history query) | PASS | `computeTrends` is a pure function over `Run[]`; `Supervision.tsx` reuses the single existing `listRecentRuns(30)` call — no new Firestore query shape. |
| AD-2 (error parsing extends `runErrors.ts`) | PASS | `classifyFailure`/`parseInsufficientSources` added alongside `isAuthFailure`, same fragility trade-off documented inline; tests pinned against real historical strings from `burn-in-log.md`. |
| AD-3 (`TrendStat` presentational only) | PASS | Takes plain props, no internal fetch/listener. |

## Quality Gates
| Check | Status | Details |
|---|---|---|
| Test | PASS | `pnpm --filter @veilleur/pwa run test` — 21 files, 164 tests, all green. |
| Lint | PASS | `pnpm --filter @veilleur/pwa run lint` — clean. |
| Type check | PASS | `pnpm --filter @veilleur/pwa run typecheck` — clean. |
| Format | N/A | No separate format-check script for `pwa/` in CLAUDE.md (lint covers Prettier via ESLint config); nothing flagged by lint. |

## Spec Compliance
| Check | Status | Notes |
|---|---|---|
| Error handling | PASS | Unrecognized error shapes fall back to the raw string (never hidden); Firestore fetch failure reuses the existing `ErrorBanner` pattern — matches spec's Error Scenarios section. |
| Codebase patterns | PASS | New files follow existing conventions: `useAsync` for data fetching, `Card`/`EmptyState`/`Skeleton` reuse, one-file-per-concern in `lib/`. |
| Design tokens applied | PASS | No raw hex/rgb literals in any new/modified file (grep-verified). `TrendStat` uses `color.status.*` via existing Tailwind utility classes (`bg-status-*`), `text.h2`/`text.caption`/`font.mono`, `space.*`, `radius.lg` (via `Card`). |
| Component inventory respected | PASS | Only `TrendStat` (newly added to `DESIGN.md` §2 on 2026-08-04, prior to `/plan`) plus already-inventoried components (`Card`, `EmptyState`, `ErrorBanner`, `RunTimeline`, `RunStepRow`, `StatusPill`, `Skeleton`) are rendered. |
| State coverage (loading/empty/error/success/offline) | PASS | Trends section: loading (`Skeleton`, matching history-list pattern), empty (`EmptyState`, per DESIGN §4 update), error (`ErrorBanner`), success (silent update, no toast — consistent with "no celebratory animations"). Offline: unchanged, inherits the existing SW-cache behavior (this feature adds no new offline-sensitive data path). |
| A11y baseline | PASS | `TrendStat`'s micro-bar is `aria-hidden` (decorative only, label/value carry the info — color-independence baseline). No new focus traps, no new motion (no `prefers-reduced-motion` concern introduced). Per-step error text is static (not `aria-live`) except for the pre-existing running-step region, unaffected by this change. |

## Constitution Compliance
| Principle | Status | Notes |
|---|---|---|
| 1. Single allowed identity | N/A | Feature is read-only UI over data already gated by existing Firestore Rules; no new access path. |
| 3. No secrets in source | PASS | No secrets touched. |
| 5. Hard caps per run | N/A | No Minion-side change. |
| 9. Observable steps | PASS | No change to what's written to `runs/{runId}/steps/{stepName}` — this feature only reads/displays existing fields. |
| 11. No third-party PII | PASS | No new data collection; purely derived from existing operator-only run data. |
| §4 Coding Standards (TS strict, no `any`, ESLint+Prettier) | PASS | Typecheck/lint both clean; no `any` introduced. |
| §5 Quality Gates | PASS | All applicable gates green (see above). |

## Issues Found
| Severity | Description | Fix |
|---|---|---|
| Low | `classifyFailure`/`parseInsufficientSources` rely on substring/regex matching against Minion-controlled message strings — a Minion wording change would silently mis-classify (never crash, per design) | Accepted trade-off, explicitly documented in code comments and plan.md's Risk section; tests pin the exact current strings so a format change breaks CI rather than mis-classifying silently in prod. No fix needed now — noted for awareness. |
| Low | `Supervision.test.tsx`'s three tests each call `listRecentRuns.mockReset()` inline rather than in a `beforeEach` — a minor deviation from the codebase's usual pattern (`History.test.tsx` uses `beforeEach`) | Discovered during implementation: calling `mockReset()` from within a `beforeEach` hook in this specific file made Vitest mis-attribute the rejection-case test's promise as an unhandled rejection (didn't reproduce in isolated repros). Documented with a comment in the test file. Not a production code issue — test-only workaround. |

## Verdict
**Ready to merge**
