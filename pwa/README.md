# @veilleur/pwa

The Veilleur PWA — the operator's reading + (later) supervision surface. React 18 + TS +
Vite + Tailwind + `vite-plugin-pwa`, reading published articles from Firestore behind
Firebase Auth.

Scope as of **F-009**: app shell, Google sign-in (mono-tenant gate), and the reading
surface (Today + History + full article). Supervision, manual trigger, LinkedIn share, and
push notifications land in F-010 → F-012.

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
