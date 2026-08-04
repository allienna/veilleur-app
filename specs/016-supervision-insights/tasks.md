# Tasks: Supervision insights

**Plan**: specs/016-supervision-insights/plan.md
**Status**: Ready
**Total**: 9 tasks across 4 phases

> Run PWA checks from repo root: `pnpm --filter @veilleur/pwa run lint`, `pnpm --filter @veilleur/pwa run typecheck`, `pnpm --filter @veilleur/pwa run test`. Phase 1 is the genuinely new work (trends); Phases 2-3 are small, surgical extensions of code F-011 already built; Phase 4 wires it together and verifies.

## Phase 1: Trends data + component (FR-1)

- [ ] **T-1.1**: `computeTrends` pure function
  - **Do**: New `pwa/src/lib/trends.ts`. `computeTrends(runs: Run[], windowDays = 21): Trends` — filters to the last `windowDays` by `date`, computes: success rate (`success` + `success_with_warnings` = success; `skipped`/`aborted` excluded from both numerator and denominator, matching `burn-in-log.md`'s counting rule), cumulative + average `costUsd` (null-safe — treat null as 0 for cumulative, exclude from the average's denominator), and a failure-cause count bucketed via `classifyFailure` (T-2.1, so this task takes a dependency on it existing — implement `classifyFailure` first if sequencing is easier, or stub it and wire in T-2.1). Handle the empty-window case (0 eligible runs) without divide-by-zero — return a `Trends` shape the UI can render as `EmptyState`.
  - **Test**: `pnpm --filter @veilleur/pwa run test -- src/lib/trends.test.ts` (written in T-1.2).

- [ ] **T-1.2**: Unit tests for `computeTrends`
  - **Do**: New `pwa/src/lib/trends.test.ts`. Cases: empty array → empty/zero `Trends`, no throw; all-success window; mixed success/failure/skipped/aborted (assert `skipped`/`aborted` excluded from denominator per AC-1); null `costUsd` entries excluded from average but not from cumulative-zero; failure-cause bucket counts sum to the number of `failure`/`success_with_warnings` runs with a matching classification.
  - **Test**: `pnpm --filter @veilleur/pwa run test -- src/lib/trends.test.ts` passes.

- [ ] **T-1.3**: `TrendStat` component
  - **Do**: New `pwa/src/components/TrendStat.tsx` per DESIGN.md §2 (added 2026-08-04): props `label: string`, `value: string` (pre-formatted, e.g. "72%" or "$4.20"), `fraction: number` (0-1, drives the CSS micro-bar width), `tone: "success" | "warning" | "error" | "neutral"` (maps to `color.status.*`). Renders inside a `Card`; bar is a plain `div` with inline/Tailwind width + `aria-hidden` (decorative — label/value carry the info, DESIGN §5 color-independence). No new dependency.
  - **Test**: `pnpm --filter @veilleur/pwa run test -- src/components/TrendStat.test.tsx` (written alongside — snapshot-free assertions: label/value text present, bar width reflects `fraction`, `aria-hidden` on the bar).

## Phase 2: Inline failure diagnosis (FR-2)

- [ ] **T-2.1**: `classifyFailure` + `parseInsufficientSources` in `runErrors.ts`
  - **Do**: Extend `pwa/src/lib/runErrors.ts`. `parseInsufficientSources(error): {ok, total, paywalled, failed} | null` — regex against the exact Minion format (`minion/src/minion/steps/ingestion.py:126-130`): `insufficient_sources: (\d+)/(\d+) ok \((\d+) paywalled, (\d+) failed`. `classifyFailure(error): "no_sources" | "insufficient_sources" | "missing_attribution" | "timeout" | "other"` — substring match: `"insufficient_sources"`, `"missing_attribution"` (from `minion/src/minion/generate/validate.py:209` via `steps/generation.py:181`'s `"validation failed after ... retries: {codes}"`), `"timed out"` (from `minion/src/minion/generate/runner.py:101`), else `"other"`. `no_sources` never appears in `error` (it's a `skipped` status, not a `failure` — see plan AD-2) so it's reachable only as a defensive branch, not from real data.
  - **Test**: `pnpm --filter @veilleur/pwa run test -- src/lib/runErrors.test.ts` (written in T-2.2).

- [ ] **T-2.2**: Unit tests for `classifyFailure`/`parseInsufficientSources`
  - **Do**: New (or extended, if it already exists — check first) `pwa/src/lib/runErrors.test.ts`. Fixtures pulled verbatim from `specs/013-hardening-burn-in/burn-in-log.md`'s real historical error strings: `"insufficient_sources: 12/100 ok (88 failed)"`-style entries (note: the log's own strings sometimes omit the paywalled/need clause in older entries — test against both the full current format and check the parser doesn't crash on a partial match, falling back to `null`), `"generate: validation failed after 1 retries: missing_attribution"`, `"generate: claude /generate timed out"`, and an unrecognized string → `"other"`.
  - **Test**: `pnpm --filter @veilleur/pwa run test -- src/lib/runErrors.test.ts` passes.

- [ ] **T-2.3**: Wire structured diagnosis into `RunTimeline`'s `ErrorBanner`
  - **Do**: In `pwa/src/components/RunTimeline.tsx`, when `run.error` is present and `parseInsufficientSources(run.error)` returns non-null, render the structured `ok/total/paywalled/failed` summary as additional content inside the existing `ErrorBanner` (below or alongside the raw message — raw string stays visible per spec's error-handling rule, never hidden).
  - **Test**: `pnpm --filter @veilleur/pwa run test -- src/components/supervision.test.tsx` (cases added in T-4.2) covers both matched and unmatched error shapes.

## Phase 3: Per-step error display (FR-3 gap-close)

- [ ] **T-3.1**: Render `step.error` in `RunStepRow`
  - **Do**: In `pwa/src/components/RunStepRow.tsx`, when `step?.error` is present, render it as a small caption line under the step name/duration row (`text.caption`, `color.status.error` text token). Absent/null error → no change to current rendering.
  - **Test**: `pnpm --filter @veilleur/pwa run test -- src/components/RunStepRow.test.tsx` (new, or added to `supervision.test.tsx` if that's the existing convention — check first): step with `error` renders the message; step without renders nothing extra.

## Phase 4: Wire into Supervision route + verify

- [ ] **T-4.1**: Add the trends section to `Supervision.tsx`
  - **Do**: In `pwa/src/routes/Supervision.tsx`, fetch enough runs for the trends window (reuse the existing `listRecentRuns` call — bump `max` if the history list's own limit is smaller than the trends window, e.g. keep both needs satisfied by one `listRecentRuns(30)` call and slice to 21 for `computeTrends`), call `computeTrends`, render 3× `TrendStat` (success rate / cost / top failure cause) inside a `Card` above the history list. Loading → `Skeleton` matching the existing history-list pattern. Empty window (0 eligible runs) → `EmptyState`, not a zero-filled bar (DESIGN §4, updated 2026-08-04).
  - **Test**: `pnpm --filter @veilleur/pwa run test -- src/components/supervision.test.tsx` (extended in T-4.2).

- [ ] **T-4.2**: Extend `supervision.test.tsx` with trends + diagnosis cases
  - **Do**: Add cases: trends section renders with populated data; trends section shows `EmptyState` with zero eligible runs; a failed run's detail view shows the structured scrape-breakdown summary when applicable and falls back to the raw string otherwise; a step with an error shows it inline (T-3.1's case, if not already covered by a dedicated `RunStepRow` test).
  - **Test**: `pnpm --filter @veilleur/pwa run test -- src/components/supervision.test.tsx` all green.

- [ ] **T-4.3**: Full PWA regression gate
  - **Do**: Run the complete PWA suite after all changes land; fix any fallout (typecheck/lint included, per constitution §5 quality gates).
  - **Test**: `pnpm --filter @veilleur/pwa run lint && pnpm --filter @veilleur/pwa run typecheck && pnpm --filter @veilleur/pwa run test` all green. Satisfies AC-1 through AC-6.
