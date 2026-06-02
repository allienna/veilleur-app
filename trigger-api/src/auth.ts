// Single allowed identity (constitution §2.1). Server-side authorization boundary:
// trigger-api MUST assert `token.email === ALLOWED_OPERATOR_EMAIL && token.email_verified`.
// Must stay byte-identical with firestore.rules and pwa/src/config.ts; enforced by
// scripts/check-allowed-email.sh.
export const ALLOWED_OPERATOR_EMAIL = "aurelien.allienne@gmail.com"; // allowed-email-pin

import { ForbiddenError, type TokenClaims } from "./ports.js";

/**
 * Authorize the verified token's claims (PRD FR-F1, constitution §2.1). Throws `ForbiddenError`
 * unless the email is the single allowed operator AND is verified. Authentication (a valid token)
 * is established earlier by the `TokenVerifier`; this is the authorization step.
 */
export function assertAllowed(claims: TokenClaims): void {
  if (
    claims.email !== ALLOWED_OPERATOR_EMAIL ||
    claims.emailVerified !== true
  ) {
    throw new ForbiddenError("not the allowed operator identity");
  }
}
