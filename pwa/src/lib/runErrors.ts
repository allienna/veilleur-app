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
