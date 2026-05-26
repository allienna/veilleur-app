// Single allowed identity (constitution §2.1). This client constant is UX-only —
// the real authorization boundary is Firestore Security Rules + trigger-api JWT
// verification. Must stay byte-identical with firestore.rules and
// trigger-api/src/auth.ts; enforced by scripts/check-allowed-email.sh.
export const ALLOWED_OPERATOR_EMAIL = "aurelien.allienne@gmail.com"; // allowed-email-pin
