import type { Run, RunStatus } from "@veilleur/shared/run";

import { classifyFailure, type FailureBucket } from "@/lib/runErrors";

const DEFAULT_WINDOW_DAYS = 21;

// Statuses excluded from both the numerator and denominator of the success rate — matches
// `specs/013-hardening-burn-in/burn-in-log.md`'s counting rule: no article was due, so the run
// isn't evidence of reliability either way.
const EXCLUDED_FROM_RATE = new Set<RunStatus>(["skipped", "aborted"]);

// `success` and `success_with_warnings` both count as success (same burn-in-log.md rule).
function isSuccess(status: RunStatus): boolean {
  return status === "success" || status === "success_with_warnings";
}

export interface Trends {
  /** Number of runs counted toward the rate (excludes skipped/aborted). */
  eligibleCount: number;
  /** Success rate over `eligibleCount`, 0-1. `null` when `eligibleCount` is 0 (no data). */
  successRate: number | null;
  /** Sum of every non-null `costUsd` in the window. */
  cumulativeCostUsd: number;
  /** Average `costUsd` over runs that have a non-null cost. `null` when none do. */
  averageCostUsd: number | null;
  /** Failure-cause counts, keyed by bucket, over `failure`/`success_with_warnings` runs only. */
  failureBreakdown: Record<FailureBucket, number>;
}

function emptyBreakdown(): Record<FailureBucket, number> {
  return {
    no_sources: 0,
    insufficient_sources: 0,
    missing_attribution: 0,
    timeout: 0,
    other: 0,
  };
}

/** Rolling-window reliability trends (F-016 FR-1) — a pure reduction over runs already fetched
 * (no new Firestore query shape). `runs` need not be pre-sorted or pre-filtered; this slices to
 * the most recent `windowDays` calendar dates present. Mirrors `burn-in-log.md`'s counting rules
 * exactly so the PWA and the hand-maintained log never disagree on the same window. */
export function computeTrends(runs: readonly Run[], windowDays = DEFAULT_WINDOW_DAYS): Trends {
  const windowed = [...runs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, windowDays);

  const eligible = windowed.filter((r) => !EXCLUDED_FROM_RATE.has(r.status));
  const successes = eligible.filter((r) => isSuccess(r.status));

  const costed = windowed.filter((r): r is Run & { costUsd: number } => r.costUsd != null);
  const cumulativeCostUsd = costed.reduce((sum, r) => sum + r.costUsd, 0);

  const failureBreakdown = emptyBreakdown();
  for (const r of windowed) {
    if (r.status === "failure" || r.status === "success_with_warnings") {
      failureBreakdown[classifyFailure(r.error)] += 1;
    }
  }

  return {
    eligibleCount: eligible.length,
    successRate: eligible.length === 0 ? null : successes.length / eligible.length,
    cumulativeCostUsd,
    averageCostUsd: costed.length === 0 ? null : cumulativeCostUsd / costed.length,
    failureBreakdown,
  };
}

/** The failure bucket with the highest count, or `null` when every bucket is 0 (no
 * failures/warnings in the window — nothing to headline). */
export function topFailureBucket(breakdown: Record<FailureBucket, number>): FailureBucket | null {
  let top: FailureBucket | null = null;
  let topCount = 0;
  for (const [bucket, count] of Object.entries(breakdown) as [FailureBucket, number][]) {
    if (count > topCount) {
      top = bucket;
      topCount = count;
    }
  }
  return top;
}
