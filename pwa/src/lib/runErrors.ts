// Classifies a run-level error string for the supervision UI. The Minion writes run.error as
// "{stepName}: {exception}" (orchestrator.py), so auth failures arrive as free text like
// "gmail: ('invalid_grant: Token has been expired or revoked.', …)" or a 401 from the
// `generate` step. This is a UX-only signal — a false positive merely surfaces a (still useful)
// recovery link, never gates access (the real boundary is Firestore Rules + trigger-api).

// Lowercased substrings that reliably indicate a revoked/expired OAuth credential rather than a
// generic pipeline failure. Kept conservative to avoid mislabelling ordinary step errors.
const AUTH_FAILURE_MARKERS = [
  "invalid_grant",
  "expired or revoked",
  "refresh token",
  "unauthorized",
  "authentication_error",
  "oauth token",
  "401",
] as const;

/** True when a run-level error looks like an OAuth credential failure (Gmail or Anthropic). */
export function isAuthFailure(error: string | null | undefined): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return AUTH_FAILURE_MARKERS.some((marker) => lower.includes(marker));
}

/** Coarse failure-cause bucket (F-016), matching the taxonomy used by hand in
 * `specs/013-hardening-burn-in/burn-in-log.md`. `no_sources` is a `status: "skipped"`, never a
 * `run.error` string, so it never matches here in practice — kept for completeness /
 * forward-compat should that ever change. */
export type FailureBucket =
  | "no_sources"
  | "insufficient_sources"
  | "missing_attribution"
  | "timeout"
  | "other";

/** French label for each bucket, for the trends breakdown display (F-016). */
export const FAILURE_BUCKET_LABEL: Record<FailureBucket, string> = {
  no_sources: "Aucune source",
  insufficient_sources: "Sources insuffisantes",
  missing_attribution: "Attribution manquante",
  timeout: "Délai dépassé",
  other: "Autre",
};

/** Classify a run-level error string into a coarse bucket for the trends breakdown (F-016). Pure
 * substring matching against stable Minion-controlled message formats — same fragility trade-off
 * `isAuthFailure` already accepts: a false classification only affects a UI grouping, never gates
 * anything. Unrecognized shapes fall back to `"other"`. */
export function classifyFailure(error: string | null | undefined): FailureBucket {
  if (!error) return "other";
  const lower = error.toLowerCase();
  if (lower.includes("no_sources")) return "no_sources";
  if (lower.includes("insufficient_sources")) return "insufficient_sources";
  if (lower.includes("missing_attribution")) return "missing_attribution";
  if (lower.includes("timed out")) return "timeout";
  return "other";
}

/** Parsed shape of the Minion's `insufficient_sources: N/M ok (P paywalled, Q failed; ...)`
 * message (`minion/src/minion/steps/ingestion.py`). Returns `null` on any shape that doesn't
 * match — callers must always keep the raw string visible as a fallback (never hide information
 * behind a failed parse). */
export interface InsufficientSourcesBreakdown {
  ok: number;
  total: number;
  paywalled: number;
  failed: number;
}

const INSUFFICIENT_SOURCES_RE =
  /insufficient_sources:\s*(\d+)\/(\d+)\s*ok\s*\((\d+)\s*paywalled,\s*(\d+)\s*failed/i;

export function parseInsufficientSources(
  error: string | null | undefined,
): InsufficientSourcesBreakdown | null {
  if (!error) return null;
  const m = INSUFFICIENT_SOURCES_RE.exec(error);
  if (!m) return null;
  const [, ok, total, paywalled, failed] = m;
  return {
    ok: Number(ok),
    total: Number(total),
    paywalled: Number(paywalled),
    failed: Number(failed),
  };
}
