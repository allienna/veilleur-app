/// <reference types="vite/client" />

// Typed VITE_FIREBASE_* env (F-009 Q3). See pwa/.env.example.
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  // trigger-api base URL for the manual "Run now" call (F-011 FR-E1). See pwa/.env.example.
  readonly VITE_TRIGGER_API_URL: string;
  // VAPID application-server public key for Web Push (F-012 FR-1). Non-secret. See pwa/.env.example.
  readonly VITE_VAPID_PUBLIC_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
