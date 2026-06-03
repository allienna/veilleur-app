// Single allowed identity (constitution §2.1). This client constant is UX-only —
// the real authorization boundary is Firestore Security Rules + trigger-api JWT
// verification. Must stay byte-identical with firestore.rules and
// trigger-api/src/auth.ts; enforced by scripts/check-allowed-email.sh.
export const ALLOWED_OPERATOR_EMAIL = "aurelien.allienne@gmail.com"; // allowed-email-pin

// Public base for hero images committed to the Astro site by the Minion `github` step
// (F-009 Q5). Resolved as `${ASTRO_IMAGES_BASE}/${article.image}`. Non-secret.
export const ASTRO_IMAGES_BASE = "https://allienna.github.io/veilleur/images/posts";

// Firebase web config (non-secret, single prod project) from VITE_FIREBASE_* env vars
// (F-009 Q3; documented in pwa/.env.example). import.meta.env is statically replaced at build.
export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
} as const;
