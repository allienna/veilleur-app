import { describe, expect, it } from "vitest";

import {
  classifyFailure,
  isAuthFailure,
  parseInsufficientSources,
} from "@/lib/runErrors";

describe("isAuthFailure", () => {
  it("recognizes a revoked Gmail OAuth token", () => {
    expect(isAuthFailure("gmail: ('invalid_grant: Token has been expired or revoked.', …)")).toBe(
      true,
    );
  });

  it("is false for an unrelated error", () => {
    expect(isAuthFailure("insufficient_sources: 12/100 ok (0 paywalled, 88 failed)")).toBe(false);
  });

  it("is false for null/undefined", () => {
    expect(isAuthFailure(null)).toBe(false);
    expect(isAuthFailure(undefined)).toBe(false);
  });
});

describe("classifyFailure", () => {
  // Real historical strings from specs/013-hardening-burn-in/burn-in-log.md — pinned so a Minion
  // message-format change breaks this test rather than silently mis-classifying in prod.
  it.each([
    ["insufficient_sources: 12/100 ok (88 failed)", "insufficient_sources"],
    ["insufficient_sources: 13/56 ok (43 failed)", "insufficient_sources"],
    [
      "generate: validation failed after 1 retries: missing_attribution",
      "missing_attribution",
    ],
    ["generate: claude /generate timed out", "timeout"],
    ["some unrecognized error shape", "other"],
    [null, "other"],
  ] as const)("classifies %s as %s", (error, expected) => {
    expect(classifyFailure(error)).toBe(expected);
  });
});

describe("parseInsufficientSources", () => {
  it("parses the current full-format message", () => {
    expect(
      parseInsufficientSources(
        "insufficient_sources: 12/100 ok (3 paywalled, 85 failed; need ≥5 and ≥50%)",
      ),
    ).toEqual({ ok: 12, total: 100, paywalled: 3, failed: 85 });
  });

  it("returns null for an older/partial log format missing the paywalled clause", () => {
    // burn-in-log.md's early entries render as "12/100 ok (88 failed)" with no paywalled count —
    // the parser must not crash, and falls back to null (raw string stays the only diagnostic).
    expect(parseInsufficientSources("insufficient_sources: 12/100 ok (88 failed)")).toBeNull();
  });

  it("returns null for an unrelated error", () => {
    expect(parseInsufficientSources("generate: claude /generate timed out")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(parseInsufficientSources(null)).toBeNull();
    expect(parseInsufficientSources(undefined)).toBeNull();
  });
});
