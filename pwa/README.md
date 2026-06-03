# @veilleur/pwa

The Veilleur PWA — the operator's reading + (later) supervision surface. React 18 + TS +
Vite + Tailwind + `vite-plugin-pwa`, reading published articles from Firestore behind
Firebase Auth.

Scope as of **F-012**: app shell, Google sign-in (mono-tenant gate), the reading surface
(Today + History + full article), supervision + manual trigger, LinkedIn share, and Web Push
notifications.

## Develop

```bash
pnpm install                              # from repo root
cp pwa/.env.example pwa/.env.local        # fill the Firebase web config (below)
pnpm --filter @veilleur/pwa run dev
```

### Quality gates

```bash
pnpm --filter @veilleur/pwa run lint
pnpm --filter @veilleur/pwa run typecheck
pnpm --filter @veilleur/pwa run test      # vitest (unit + component)
pnpm --filter @veilleur/pwa run build
pnpm test:rules                           # Firestore Rules vs the emulator (needs Java + firebase-tools)
```

## Configuration (F-009 Q3)

Firebase web config is **non-secret** (single prod project) and supplied via `VITE_FIREBASE_*`
env vars — see [`.env.example`](.env.example). `import.meta.env` statically replaces them at
build time. The allowed-operator email and the Astro hero-image base URL live in
[`src/config.ts`](src/config.ts); the email constant is one of the three pinned locations
enforced by `pnpm check:email` (see root `CLAUDE.md`).

## Push notifications (F-012)

Web Push uses a single VAPID keypair (application-server identity, RFC 8292). Generate it
**once**, then store the halves in two places — never commit either key:

```bash
# Generate a VAPID keypair (any of these works; web-push is the simplest):
npx web-push generate-vapid-keys
#   → Public Key:  B....   (87 chars, base64url)  — non-secret
#   → Private Key: ....                            — SECRET
```

- **Public key** → `VITE_VAPID_PUBLIC_KEY` in `pwa/.env.local` (and the CI/deploy env). Non-secret;
  shipped into the bundle, used by `PushManager.subscribe` (see [`.env.example`](.env.example)).
- **Private key** → Secret Manager secret `vapid-private-key` (the Minion signs payloads with it;
  IAM access granted in `infra/iam.tf`). Add a version with:
  ```bash
  printf %s "<private-key>" | gcloud secrets versions add vapid-private-key --data-file=-
  ```

**iOS prerequisite (R8/R11):** Web Push only works on iOS 16.4+ **after the PWA is installed to the
home screen**. Before install the `PushManager` API is absent — the `NotificationOptIn` control
(on the Supervision view) surfaces this as inline guidance. End-to-end delivery is verified on a
real iPhone in **F-013** (AC-10); never simulate iOS push in Chrome DevTools.

The service worker is custom (`src/sw.ts`, `injectManifest` strategy) so it can host the `push` /
`notificationclick` handlers; its push logic is unit-tested in `src/lib/pushHandlers.test.ts`.

## Auth & authorization

Defense-in-depth (constitution §2.1, FR-F1):

1. **Firestore Security Rules** (`firestore.rules`) — the real boundary; `articles` reads are
   allowed only for `email == <allowed> && email_verified`.
2. **trigger-api JWT** — server-side (F-008), used by the manual trigger in F-011.
3. **PWA soft check** (`src/auth/authStatus.ts`) — UX only; routes a non-allowed/unverified
   identity to `UnauthorizedScreen`.

## Deploy (F-009 Q4 — manual path)

CI (`deploy-pwa` workflow) runs lint/typecheck/build on every PR; the **deploy job is
intentionally guarded** (`if: false`). Production deploys are operator-run for now:

```bash
# one-time: firebase login   (use the personal gmail GCP account — see project memory)
pnpm --filter @veilleur/pwa run build
firebase deploy --only hosting        # uses firebase.json (public: pwa/dist, SPA rewrite)
```

Firebase Hosting config lives in repo-root `firebase.json` / `.firebaserc` (project
`veilleur-app`). Wiring this into CI (Workload Identity Federation) is deferred to a later
track.

## Known follow-ups

- **iOS apple-touch icon**: the manifest currently uses a scalable SVG icon
  (`public/icons/icon.svg`). A raster `apple-touch-icon.png` (180×180) improves the
  home-screen icon on older iOS; drop one in `public/icons/` and reference it in
  `index.html` + the manifest.
- **Performance**: see [`PERF.md`](PERF.md) for the LCP / cached-reload measurement method
  and the Firebase bundle-size note (AC-9).
