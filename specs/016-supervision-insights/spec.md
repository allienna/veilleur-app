# Spec: Supervision insights

**Track ID**: 016-supervision-insights
**Roadmap ref**: F-016
**Status**: In Progress
**Created**: 2026-08-04
**Branch**: feat/016-supervision-insights
**PRD sections**: FR-D1 (live supervision), FR-D2 (run history)
**Depends on**:
- F-011 PWA supervision + manual trigger — **Complete** (run history list, live `/runs/:date` view, `RunTimeline`/`RunStepRow`/`StatusPill`/`ErrorBanner`)
- F-013 hardening + burn-in — **In Progress, ongoing** (source of the failure-pattern data this feature surfaces, e.g. the weekend `insufficient_sources` correlation)

## Context
F-011 gives the operator a live run view and a flat history list, but two gaps show up in real daily use (post-talk, per operator feedback 2026-08-04):
1. Spotting a *pattern* across days (is the pipeline getting more or less reliable? is cost creeping up? do failures cluster on weekends?) currently means hand-reading `specs/013-hardening-burn-in/burn-in-log.md` — a markdown file, not the PWA.
2. Diagnosing *why* a run failed means opening Cloud Logging or the Firestore console to read `steps/{stepName}.error`, because the PWA only surfaces the run-level `ErrorBanner`, not the raw per-step error strings already written by the Minion (F-003).

Both gaps are readable from data already in Firestore (`runs/{date}` + `steps/{stepName}`, both written since F-003) — this is a PWA view/aggregation feature, not a new data-collection feature.

## User Stories
- As the operator, I want to see my rolling success rate, cost trend, and failure-cause breakdown over the last N days in the PWA, so I can tell if the pipeline is actually getting more reliable without reading a markdown log by hand.
- As the operator, I want a failed run's detail view to show me the likely cause (e.g. a scrape ok/paywalled/failed breakdown, or a link to the re-auth runbook for auth failures) directly, so I don't have to open Cloud Logging or Firestore console to understand what happened.
- As the operator, I want to open any past run (not just a live one) and see each of its steps with duration and raw error message, so I can compare a bad day to a good one.

## Functional Requirements

### FR-1: Trends view
A new view (or a section added to the existing `/supervision` history view) showing, over a configurable rolling window (default 21 days, matching the PRD §1 reliability target):
- Success rate (`success` + `success_with_warnings` counted as success, matching `burn-in-log.md`'s counting rule; `skipped`/`aborted` excluded from the denominator, same rule).
- Cumulative + average cost (`costUsd`, null-safe).
- Failure-cause breakdown: count of runs per `status` and, for `failure`, a coarse bucket parsed from `error` (`no_sources`, `insufficient_sources`, `missing_attribution`, `timeout`, `other`) — same taxonomy already used by hand in `burn-in-log.md`.
- Data source: a Firestore query over `runs` ordered by `date` desc, limited to the window — no new Minion-side writes.

### FR-2: Inline failure diagnosis
On the existing `/runs/:date` detail view, when `status === "failure"` (or `success_with_warnings`):
- Parse the run-level `error` string (already written by the Minion, e.g. `"insufficient_sources: 12/100 ok (88 failed)"`) into a small structured summary (ok/paywalled/failed counts when the message matches that shape) instead of showing the raw string as the only diagnostic.
- If the error indicates an auth failure (Gmail/Anthropic), show an inline link to the relevant `infra/RUNBOOK.md` §3 re-auth section (same link already used by `ErrorBanner`'s auth-failure case per F-013 T-2.1 — reuse that mapping, don't duplicate it).
- Unrecognized error shapes fall back to showing the raw string — never hide information the operator doesn't have a parser for.

### FR-3: Per-step drill-down on any run
Extend the existing `/runs/:date` view (already renders `RunTimeline`/`RunStepRow` for live runs, per F-011 FR-1) so it works identically for a **past, non-live** run: same 9(-10, incl. `fiches`)-step timeline, each step's `status`, `startedAt`/`endedAt` (rendered as duration), and its `error` string if present — all fields already in `shared/schema/run.json`'s `RunStep`. No new Firestore fields; this is making sure the existing listener/view path also serves historical dates cleanly (F-011 built this primarily for the live case).

## API Endpoints Involved
| Source API | Method | Path | Purpose |
|------------|--------|------|---------|
| Firestore (client SDK) | query | `runs` (orderBy date desc, limit = window size) | Trends aggregation (FR-1) — read-only, reuses the F-011 history query pattern with a larger/configurable limit. |
| Firestore (client SDK) | read + listener | `runs/{date}` + `runs/{date}/steps` | Per-step drill-down (FR-3) — same read path F-011 already uses for live runs, applied to past dates. |

## Design References
| Surface | Components used | New components needed |
|---------|-----------------|-----------------------|
| `/supervision` trends section | `TrendStat` (new, added to DESIGN.md §2 Standard inventory 2026-08-04), `Card`, `EmptyState` | none — `TrendStat` is now inventoried (CSS-only micro-bar, no chart library) |
| `/runs/:date` inline diagnosis | `ErrorBanner` (existing, already used for the live auth-failure case), `Card` | none — reuses existing components, just richer content inside them |
| `/runs/:date` per-step drill-down | `RunTimeline`, `RunStepRow`, `StatusPill` (existing) | none — extends existing usage to non-live dates |

## Error Scenarios
- **No runs in the window** (e.g. fresh install, or a long `skipped` streak): trends view shows `EmptyState` per existing DESIGN pattern, not a zero-filled chart.
- **`error` string doesn't match a known parse pattern**: FR-2 falls back to the raw string, never blocks rendering.
- **Firestore query for the trends window fails**: existing `ErrorBanner` (info/error variant) — matches F-011's error handling, not a new pattern.

## Acceptance Criteria
- [ ] AC-1: The trends view shows a rolling-window success rate (default 21 days) matching the same counting rule as `burn-in-log.md` (`success`/`success_with_warnings` = success; `skipped`/`aborted` excluded).
- [ ] AC-2: The trends view shows cumulative and average `costUsd` over the same window, null-safe.
- [ ] AC-3: The trends view shows a failure-cause breakdown (`no_sources`, `insufficient_sources`, `missing_attribution`, `timeout`, `other`) over the window.
- [ ] AC-4: On a failed/warned run's detail view, a parsed diagnostic summary is shown when the error string matches a known shape; the raw string is always still visible.
- [ ] AC-5: On an auth-related failure, the detail view shows a link to the re-auth runbook section, consistent with the existing `ErrorBanner` auth-failure link (F-013 T-2.1).
- [ ] AC-6: `/runs/:date` for a past, completed (non-live) date renders the same 9/10-step timeline with per-step status, duration, and error string as it does for a live run.

## Out of Scope
- Any new Minion-side write or schema change — this feature is read/aggregation only over existing `runs`/`steps` data.
- Predictive alerting ("notify me if the trend looks bad") — out of scope, PRD has no such requirement.
- Cross-run analytics beyond the rolling window (e.g. month-over-month comparisons) — can be a future feature if the window proves insufficient.
- Replacing `burn-in-log.md` — it stays as the durable, git-tracked record; this feature makes the same *kind* of insight visible day-to-day without opening the file, it doesn't retire it.

## Open Questions
- **Q1 (chart component) → RESOLVED (2026-08-04, option a)**: added `TrendStat` to `DESIGN.md` §2 Standard inventory — a `Card`-based stat row with a CSS-only micro-bar (no chart/SVG library, no new dependency). Covers FR-1's success-rate, cost, and failure-breakdown display.
