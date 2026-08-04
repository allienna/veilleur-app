# Plan: Supervision insights

**Spec**: specs/016-supervision-insights/spec.md

## Scope correction (found during planning)

Reading the existing PWA code changed the scope materially versus the spec's framing:

- **FR-3 (per-step drill-down) is already 90% done by F-011.** `/runs/:date` (`Run.tsx`) + `useRun`
  (`subscribeRun`) already work identically for a live or a completed past date — Firestore doesn't
  care which. `RunTimeline`/`RunStepRow` already render all ten steps in order with status + duration.
  The one real gap: `RunStepRow` never renders `step.error` — a failed step's own message is silently
  dropped (only the run-level `error` surfaces, via `RunTimeline`'s `ErrorBanner`). AC-6 only needs
  that one gap closed.
- **FR-2's auth-link half is already done.** `pwa/src/lib/runErrors.ts` (`isAuthFailure`) +
  `RunTimeline`'s `reauthAction` already show the re-auth runbook link on auth failures. What's
  missing is the **scrape breakdown parse** (`insufficient_sources: N/M ok (P paywalled, Q failed;
  need ≥X and ≥Y%)`, written by `minion/src/minion/steps/ingestion.py:126-130`) into a structured
  summary instead of showing the raw string as the only diagnostic.
- **FR-1 (trends) is genuinely new** — no aggregation code exists; this is the bulk of the real work.

Net effect: this feature is smaller than the spec estimated (M size stands, but weighted almost
entirely toward FR-1).

## Architecture Decisions

### AD-1: Trends computed client-side from the existing history query, not a new Firestore field
- **Choice**: `computeTrends(runs: Run[], windowDays = 21)` — a pure function over the array already
  fetched by `listRecentRuns` (bump its `max` default call site for the trends section to cover the
  window, e.g. `listRecentRuns(21)` — no new query shape, same `orderBy(documentId(), "desc")`).
- **Rationale**: The window is small (21 runs), the operator is the only reader, and this avoids any
  Minion-side write or Firestore schema change (spec's Out of Scope explicitly forbids that). A
  client-side reduce is trivially correct and testable with plain unit tests.
- **Alternatives considered**: A Cloud Function pre-aggregating trends into a `stats/rolling` doc —
  rejected as premature (single reader, 21 rows, sub-millisecond reduce; would add a second write path
  to keep in sync with `burn-in-log.md`'s counting rules for no real benefit).

### AD-2: Error-string parsing lives in `runErrors.ts`, extended not replaced
- **Choice**: Add `classifyFailure(error): FailureBucket` and `parseInsufficientSources(error):
  {ok,total,paywalled,failed} | null` next to the existing `isAuthFailure`. Bucket taxonomy mirrors
  `burn-in-log.md`'s manual one: `no_sources` (never reaches `error` — it's `status: "skipped"`, so
  bucketing only applies to `status === "failure" | "success_with_warnings"`), `insufficient_sources`,
  `missing_attribution`, `timeout`, `other`.
- **Rationale**: These are string-prefix/substring matches against Minion-controlled, stable message
  formats (`ingestion.py`, `generate/runner.py`, `steps/generation.py`) — same fragility class as the
  existing `isAuthFailure`, which already accepts that trade-off (comment: "UX-only signal — a false
  positive merely surfaces a still-useful recovery link, never gates access"). Unrecognized shapes
  fall back to `"other"` / the raw string, per spec's error-handling rule — never a hard failure.
- **Alternatives considered**: Structured error codes written by the Minion (e.g. `run.errorCode`) —
  cleaner long-term, but a schema + Minion change, explicitly out of scope for this feature; noted as
  a future improvement if the string-matching proves too brittle.

### AD-3: `TrendStat` is presentational only; no new Firestore listener
- **Choice**: `TrendStat` (DESIGN.md, added 2026-08-04) takes plain props (`label`, `value`,
  `fraction`, `tone`) — it renders, it does not fetch. The `Supervision` route computes trends once
  from the same `listRecentRuns` call already used for the history list (fetch once, derive both the
  list and the trends section from it — no second query).
- **Rationale**: Keeps `TrendStat` trivially testable and reusable; avoids a second Firestore round
  trip for data already in hand.

## Affected Files

### New Files
| File | Purpose |
|---|---|
| `pwa/src/components/TrendStat.tsx` | New component per DESIGN.md §2 — label + value + CSS micro-bar. |
| `pwa/src/lib/trends.ts` | `computeTrends(runs, windowDays)` — success rate, cost, failure-cause breakdown. Pure, unit-tested. |
| `pwa/src/lib/trends.test.ts` | Unit tests for `computeTrends` (empty window, all-success, mixed, `skipped`/`aborted` exclusion per `burn-in-log.md`'s counting rule). |

### Modified Files
| File | Change |
|---|---|
| `pwa/src/lib/runErrors.ts` | Add `classifyFailure` + `parseInsufficientSources` (AD-2). Extend `runErrors.test.ts` (or create it if it doesn't exist — check first). |
| `pwa/src/components/RunStepRow.tsx` | Render `step.error` inline (small caption line under the row, `color.status.error` text) when present — closes the FR-3/AD-6 gap. Reduced-motion/a11y unaffected (no new animation). |
| `pwa/src/components/RunTimeline.tsx` | When `run.error` matches `parseInsufficientSources`, render the structured ok/paywalled/failed summary inside the `ErrorBanner` instead of (or in addition to) the raw string — keep the raw string visible per spec's error-handling rule. |
| `pwa/src/routes/Supervision.tsx` | Add a trends section above the history list: fetch via the existing `listRecentRuns` call (bump window as needed), `computeTrends`, render 3× `TrendStat` (success rate, cost, failure breakdown) in a `Card`, with `EmptyState` when the window has zero non-`skipped`/`aborted` runs. |
| `pwa/src/components/supervision.test.tsx` | Extend with trends-section cases (empty, populated, failure-breakdown rendering) and the new inline step-error / structured-diagnosis cases. |
| `specs/roadmap.md` | Status F-016 "Specifying" → "In Progress" once this plan is approved (Step 4). |

## Implementation Phases

### Phase 1: Trends data + component (FR-1)
- `computeTrends` (pure function) + unit tests — success-rate/cost/failure-bucket math, matching
  `burn-in-log.md`'s counting rules exactly (this is the part most likely to have an off-by-one on
  `skipped`/`aborted` exclusion, so it gets dedicated tests).
- `TrendStat` component per DESIGN.md §2, with its three states (default/loading/empty).

### Phase 2: Inline failure diagnosis (FR-2)
- `classifyFailure` + `parseInsufficientSources` in `runErrors.ts`, unit-tested against the real
  message shapes pulled from `ingestion.py`/`generate/runner.py`/`steps/generation.py` and from
  `burn-in-log.md`'s historical entries (regression fixture — those exact strings must classify
  correctly).
- Wire the structured summary into `RunTimeline`'s existing `ErrorBanner` rendering.

### Phase 3: Per-step error display (FR-3 gap-close)
- `RunStepRow`: render `step.error` when present. Verify `/runs/:date` for a past, non-live date
  already renders correctly end-to-end (AC-6) — likely just a test addition, not new code, per the
  Scope correction above.

### Phase 4: Wire into `Supervision.tsx` + verify
- Assemble Phases 1-3 into the `/supervision` route. Full component-test pass + lint/typecheck.

## Design Mobilization
- **Tokens used**: `color.status.success` / `color.status.warning` / `color.status.error` /
  `color.status.neutral` (bucket colors in `TrendStat`'s micro-bar), `text.h2`, `text.caption`,
  `font.mono` (numeric values), `space.md`/`space.sm`, `radius.lg` (`Card`), `density.card.padding`
  (`compact`, per the `/supervision` surface).
- **Components used**: `TrendStat` (new, already added to DESIGN.md §2), `Card`, `EmptyState`,
  `ErrorBanner`, `RunTimeline`, `RunStepRow`, `StatusPill` — all inventoried, no blocker.
- **Surfaces touched**: `pwa` only (`/supervision`, `/runs/:date`), `Container width="supervision"`
  (unchanged, `max-w-5xl`, `compact` density).
- **States covered**: loading (`Skeleton` for the trends section, matching the existing history-list
  pattern), empty (`EmptyState` when the window is empty — DESIGN §4 Empty, updated 2026-08-04 for
  this exact case), error (Firestore query failure → existing `ErrorBanner` pattern, no new one),
  success (silent — trends update in place, no toast, consistent with "no celebratory animations").
- **A11y notes**: `TrendStat`'s micro-bar is decorative (`aria-hidden`); the label + value text
  carries the actual information (color-independence baseline, DESIGN §5). Inline step-error text
  needs no new ARIA — it's static text in an already-`aria-live` region (`RunStepRow`'s running-step
  region per DESIGN §5) only for the currently-running step; past-run errors are static.

## Test Strategy
- **Mocking approach**: matches F-011's existing pattern — `pwa/src/data/runs.test.ts` mocks
  Firestore via the same harness; `computeTrends`/`classifyFailure` are pure functions, tested with
  plain fixtures (no mocking needed).
- **Happy paths**: `computeTrends` over a realistic mixed window (some success, some failure, some
  skipped) matches hand-computed expected values; `TrendStat` renders label/value/bar correctly;
  `RunStepRow` shows a step's error text when present, nothing when absent.
- **Error scenarios**: `classifyFailure` against every real message shape seen in
  `burn-in-log.md` (`insufficient_sources`, `missing_attribution`, `timed out`, an unrecognized
  string → `other`, falls back to raw text); Firestore query failure in the trends fetch → same
  `ErrorBanner` path as the existing history-list error case (no new error UI to test beyond reuse).
- **Edge cases**: empty window (0 runs) → `EmptyState`, not a divide-by-zero in `computeTrends`;
  window with only `skipped`/`aborted` runs → excluded from both numerator and denominator (matches
  `burn-in-log.md`'s counting rule, AC-1); `costUsd`/`tokens` null-safety (skipped/failed-early runs).

## Risk & Complexity
- **Estimated complexity**: Low–Medium. The two riskiest-looking asks (FR-2's auth link, FR-3's
  drill-down) turned out to be mostly already built by F-011; the remaining work is one new pure
  aggregation function, one new presentational component, and a handful of surgical edits to existing
  files.
- **Key risks**: `classifyFailure`'s string matching is inherently brittle against a Minion message
  format change (same trade-off `isAuthFailure` already accepts) — mitigated by unit tests pinned to
  the actual source strings (`ingestion.py`, `generate/runner.py`, `steps/generation.py`) so a format
  change breaks the test, not silently mis-classifies in production.
- **New dependencies**: none (constitution/DESIGN both rule out a chart library; `TrendStat` is
  CSS-only).
