import { describe, expect, it } from "vitest";

import { computeTrends, topFailureBucket } from "@/lib/trends";
import { makeRun } from "@/test/fixtures";

describe("computeTrends", () => {
  it("returns null rate/average and zero breakdown for an empty window", () => {
    const trends = computeTrends([]);
    expect(trends.eligibleCount).toBe(0);
    expect(trends.successRate).toBeNull();
    expect(trends.cumulativeCostUsd).toBe(0);
    expect(trends.averageCostUsd).toBeNull();
    expect(Object.values(trends.failureBreakdown).every((n) => n === 0)).toBe(true);
  });

  it("counts success and success_with_warnings as success", () => {
    const runs = [
      makeRun({ date: "2026-08-01", status: "success" }),
      makeRun({ date: "2026-08-02", status: "success_with_warnings" }),
      makeRun({ date: "2026-08-03", status: "failure", error: "generate: claude /generate timed out" }),
    ];
    const trends = computeTrends(runs);
    expect(trends.eligibleCount).toBe(3);
    expect(trends.successRate).toBeCloseTo(2 / 3);
  });

  it("excludes skipped and aborted from both numerator and denominator (burn-in-log.md rule)", () => {
    const runs = [
      makeRun({ date: "2026-08-01", status: "success" }),
      makeRun({ date: "2026-08-02", status: "skipped" }),
      makeRun({ date: "2026-08-03", status: "aborted" }),
    ];
    const trends = computeTrends(runs);
    expect(trends.eligibleCount).toBe(1);
    expect(trends.successRate).toBe(1);
  });

  it("sums cumulative cost and excludes null costs from the average, not the cumulative", () => {
    const runs = [
      makeRun({ date: "2026-08-01", status: "success", costUsd: 0.5 }),
      makeRun({ date: "2026-08-02", status: "success", costUsd: 1.5 }),
      makeRun({ date: "2026-08-03", status: "skipped", costUsd: null }),
    ];
    const trends = computeTrends(runs);
    expect(trends.cumulativeCostUsd).toBe(2);
    expect(trends.averageCostUsd).toBe(1);
  });

  it("buckets failure-cause counts over failure/success_with_warnings runs only", () => {
    const runs = [
      makeRun({
        date: "2026-08-01",
        status: "failure",
        error: "insufficient_sources: 12/100 ok (88 failed)",
      }),
      makeRun({
        date: "2026-08-02",
        status: "success_with_warnings",
        error: "generate: validation failed after 1 retries: missing_attribution",
      }),
      makeRun({ date: "2026-08-03", status: "success", error: null }),
      makeRun({ date: "2026-08-04", status: "skipped", error: null }),
    ];
    const trends = computeTrends(runs);
    expect(trends.failureBreakdown.insufficient_sources).toBe(1);
    expect(trends.failureBreakdown.missing_attribution).toBe(1);
    expect(trends.failureBreakdown.other).toBe(0);
  });

  it("slices to the most recent windowDays dates, not just array order", () => {
    const runs = [
      makeRun({ date: "2026-07-01", status: "failure", error: "x" }),
      makeRun({ date: "2026-08-01", status: "success" }),
      makeRun({ date: "2026-08-02", status: "success" }),
    ];
    const trends = computeTrends(runs, 2);
    expect(trends.eligibleCount).toBe(2);
    expect(trends.successRate).toBe(1);
  });
});

describe("topFailureBucket", () => {
  it("returns the bucket with the highest count", () => {
    expect(
      topFailureBucket({
        no_sources: 0,
        insufficient_sources: 3,
        missing_attribution: 1,
        timeout: 0,
        other: 0,
      }),
    ).toBe("insufficient_sources");
  });

  it("returns null when every bucket is zero", () => {
    expect(
      topFailureBucket({
        no_sources: 0,
        insufficient_sources: 0,
        missing_attribution: 0,
        timeout: 0,
        other: 0,
      }),
    ).toBeNull();
  });
});
