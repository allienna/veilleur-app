// Single allowed identity (constitution §2.1). Server-side authorization boundary:
// trigger-api MUST assert `token.email === ALLOWED_OPERATOR_EMAIL && token.email_verified`.
// Must stay byte-identical with firestore.rules and pwa/src/config.ts; enforced by
// scripts/check-allowed-email.sh.
export const ALLOWED_OPERATOR_EMAIL = "aurelien.allienne@gmail.com"; // allowed-email-pin

// TODO(F-008): verify Firebase Auth JWT, assert email === ALLOWED_OPERATOR_EMAIL
// && email_verified === true, then invoke the Cloud Run Job and return { runId }.
