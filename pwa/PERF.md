# PWA performance — F-009 AC-9

**Targets (PRD §4 / FR-B1):** cold-start LCP ≤ 2s on iPhone 4G; service-worker-cached
reload ≤ 500ms.

## Measurement method

Cold-start LCP, throttled to an iPhone-4G-equivalent profile:

```bash
pnpm --filter @veilleur/pwa run build
pnpm --filter @veilleur/pwa run preview      # serves dist/ at http://localhost:4173
# In a separate shell (Chrome required):
npx lighthouse http://localhost:4173 \
  --preset=desktop --only-categories=performance \
  --throttling-method=simulate \
  --throttling.cpuSlowdownMultiplier=4 \
  --form-factor=mobile --screenEmulation.mobile=true
```

Lighthouse's mobile preset simulates a ~Slow-4G / 4× CPU profile — the standard proxy for the
PRD's "iPhone 4G". Read **LCP** from the report. For the cached-reload number, load once
(populates the service worker), then reload and read LCP again (the SW precache serves the
shell offline-first).

Real-device check (F-013 burn-in): install to an iPhone home screen, open on cellular, and
confirm the article paints within ~2s.

## Build-time bundle profile (this build)

Routes are code-split (`AD-4`), so the Today path's own chunk is tiny:

| Chunk | Raw | Gzip |
|---|---|---|
| `index` (shared — **Firebase Auth + Firestore**) | 756 kB | 203 kB |
| `Today` route | 0.57 kB | 0.39 kB |
| `History` route | 1.28 kB | 0.68 kB |
| `ArticleView` | 0.79 kB | 0.46 kB |
| CSS | 12.8 kB | 3.6 kB |

Applied LCP levers: route-level `lazy()` splitting; reads from Firestore (not the Astro
site); hero image decoupled from LCP (text renders even if the image 404s/late-loads); SW
precaches the shell for the ≤500ms repeat-load target.

## Status & known gap

- **Cached-reload ≤500ms**: structurally satisfied — `vite-plugin-pwa` precaches the 14-entry
  app shell; a warm reload is served from cache.
- **Cold LCP ≤2s**: **not yet measured on device.** The shared chunk is dominated by the
  Firebase SDK (203 kB gzip), which is the main risk to the 4G budget. This matches the
  plan's risk note (F-009 plan §Risk): if a device run exceeds 2s, the lever is to trim the
  Firebase surface (lazy-import `firebase/auth` and `firebase/firestore` so the auth gate's
  first paint doesn't pull Firestore, and/or split the SDK into its own deferred chunk).
- **Owner**: device measurement + any bundle trim are scheduled for **F-013 (hardening /
  7-day burn-in)**, where the PWA runs on the real iPhone. Tracked here rather than silently
  assumed to pass.
