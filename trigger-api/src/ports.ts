// Injected seams for the request handler (F-008 plan AD-1). The Firebase + Cloud Run SDKs sit
// behind these so the handler unit-tests hermetically (fakes in fakes.ts).

export interface TokenClaims {
  email: string;
  emailVerified: boolean;
}

export interface TokenVerifier {
  /** Verify a Firebase ID token. Throws `UnauthenticatedError` on any invalid/expired token. */
  verifyToken(idToken: string): Promise<TokenClaims>;
}

export interface JobRunner {
  /** Invoke the `minion` Cloud Run Job (optionally for `date`); returns the execution name. */
  runJob(date?: string): Promise<{ execution: string }>;
}

/** Not authenticated — missing/malformed/invalid token → HTTP 401. */
export class UnauthenticatedError extends Error {}

/** Authenticated but not the allowed operator identity → HTTP 403. */
export class ForbiddenError extends Error {}

/** The Cloud Run Job invocation failed → HTTP 500 (generic to the caller). */
export class JobRunError extends Error {}
