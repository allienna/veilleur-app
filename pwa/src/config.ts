// Single allowed identity (constitution §2.1). This client constant is UX-only —
// the real authorization boundary is Firestore Security Rules + trigger-api JWT
// verification. Must stay byte-identical with firestore.rules and
// trigger-api/src/auth.ts; enforced by scripts/check-allowed-email.sh.
export const ALLOWED_OPERATOR_EMAIL = "aurelien.allienne@gmail.com"; // allowed-email-pin

// Base for hero images committed to `site/public/images/posts` by the Minion `github` step
// (F-009 Q5). Resolved as `${ASTRO_IMAGES_BASE}/${article.image}`. Non-secret.
//
// Same-origin, not the public Astro site: the Minion currently publishes articles+images to
// *this* repo (`GITHUB_REPO_NAME = "veilleur-app"`, constitution AD-4 — the flip to the public
// `allienna/veilleur` repo is a deliberately deferred post-talk step), so
// `allienna.github.io/veilleur/images/...` 404s for every image this pipeline generates. The PWA
// serves its own copy instead, via `pwa/public/images` (a symlink to `../../site/public/images`,
// the same directory the Minion commits into) — no dependency on which repo ends up live.
export const ASTRO_IMAGES_BASE = "/images/posts";

// Author byline photo (DESIGN: mirrors ../veilleur/site's ArticleLayout author bar). Same
// symlinked `pwa/public/images` directory as the hero images, one level up (`images/avatar.jpg`).
export const AUTHOR_AVATAR_URL = "/images/avatar.jpg";

// Public Astro site (`site`+`base` from ../veilleur/site/astro.config.mjs). The footer's secondary
// nav targets pages that exist only there (confidentialite, mentions-legales, newsletter, contact,
// rss.xml) — the PWA has no such routes, so those links leave the app. Non-secret.
export const PUBLIC_SITE_URL = "https://allienna.github.io/veilleur";

// trigger-api base URL for the manual "Run now" call (F-011 FR-E1). The PWA POSTs
// `${TRIGGER_API_URL}/trigger` with the operator's Firebase ID token. Non-secret — the real
// boundary is the trigger-api JWT verification. Per-env via VITE_TRIGGER_API_URL (pwa/.env.example).
export const TRIGGER_API_URL = import.meta.env.VITE_TRIGGER_API_URL;

// Deep link to the operator OAuth re-auth runbook (infra/RUNBOOK.md §3). Surfaced by the
// supervision ErrorBanner when a run fails on an auth error so the operator can recover Gmail /
// Anthropic credentials without hunting for the procedure (F-013 FR-1). Non-secret.
export const REAUTH_RUNBOOK_URL =
  "https://github.com/allienna/veilleur-app/blob/main/infra/RUNBOOK.md#3-oauth-re-auth-gmail--anthropic--prd-r3";

// VAPID application-server public key for Web Push subscription (F-012 FR-1). Non-secret
// (it's the public half of the keypair); the private half lives in Secret Manager and the
// Minion signs payloads with it. Per-env via VITE_VAPID_PUBLIC_KEY (pwa/.env.example).
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

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
