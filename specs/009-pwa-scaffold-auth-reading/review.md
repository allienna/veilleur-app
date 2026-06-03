# Review: PWA scaffold + Auth + Reading (F-009)

**Spec**: specs/009-pwa-scaffold-auth-reading/spec.md
**Reviewed**: 2026-06-03
**Verdict**: **Pass with notes**

## Task completion

26 / 26 tasks complete across 4 phases (see `tasks.md`). Phase 1 (shared schema + Minion
swap) landed first behind `check:codegen` + the full Minion suite, as planned, de-risking the
cross-boundary change before any UI work.

## Quality gates

| Gate | Command | Result |
|---|---|---|
| TS lint | `pnpm lint` | ✓ (pwa + trigger-api) |
| TS typecheck | `pnpm typecheck` | ✓ `strict`, no `any`, no `@ts-ignore` |
| TS build | `pnpm --filter @veilleur/pwa build` | ✓ emits `manifest.webmanifest` + `sw.js` |
| PWA unit/component | `pnpm --filter @veilleur/pwa test` | ✓ 20 passed |
| Firestore Rules | `pnpm test:rules` (emulator) | ✓ 6 passed |
| Minion gate | ruff + format + pyright + pytest | ✓ 147 passed, 0 type errors |
| Codegen sync | `pnpm check:codegen` | ✓ no drift |
| Email invariant | `pnpm check:email` | ✓ byte-identical across 3 pins |

## Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| AC-1 runnable; lint/typecheck/build pass, strict | ✅ | gates above; `pwa/` builds and `dev` serves |
| AC-2 iOS-installable PWA; `lang="fr"` | ✅ | `manifest.webmanifest` + `sw.js` emitted; `index.html` lang=fr, theme-color, apple-* meta. *Note:* manifest uses a scalable SVG icon; raster `apple-touch-icon.png` is a documented follow-up (`pwa/README`). |
| AC-3 unauth → SignInScreen; sign-in persists | ✅ | `App.tsx` gate; `firebase.ts` `browserLocalPersistence`; `SignInScreen` fires `onSignIn` (tested) |
| AC-4 allowed+verified → app; else → Unauthorized | ✅ | `deriveStatus` unit-tested for all four cases (allowed/verified, non-allowed, unverified, signed-out) |
| AC-5 Today: ArticleView + Skeleton + EmptyState | ✅ | `routes/Today.tsx`; `ArticleView`/`SkeletonCard`/`EmptyState` rendered & tested |
| AC-6 History lists ~30 desc; tap → /article/:date | ✅ | `listRecentArticles` `orderBy("date","desc")` limit 30 (tested); `ArticleCard` links to `/article/{date}` (tested) |
| AC-7 Rules: articles read gated; writes denied; deny-all elsewhere | ✅ | 6 emulator tests: allowed read ✓; non-allowed/unverified/unauth denied; client write denied; `runs/*` denied |
| AC-8 allowed-email byte-identical in 3 locations | ✅ | `pnpm check:email` passes; `config.ts` pin untouched |
| AC-9 LCP ≤2s / cached reload ≤500ms (4G), method documented | ⚠️ **Note** | Method + bundle profile documented in `pwa/PERF.md`. Cached reload structurally met (SW precache). **Cold on-device LCP not measured** (no browser/device in this env); Firebase SDK dominates the 203 kB-gzip shared chunk — deferred to **F-013** burn-in with the bundle-trim lever identified. |
| AC-10 offline render + ErrorBoundary | ✅ | Workbox runtime caching (Firestore NetworkFirst, hero SWR); offline `ErrorBanner` in `AppShell`; `ErrorBoundary` + `pwa.boundary` log tested |
| AC-11 all five DESIGN §4 states on every view | ✅ | loading=`SkeletonCard`, empty=`EmptyState`, error=`ErrorBanner`, success=`ArticleView`, offline=info banner — present on Today/History/Article |

## Spec conformance notes

- **Defense-in-depth (FR-F1)**: real boundary is Firestore Rules (AC-7, emulator-proven); PWA
  check is correctly UX-only (`authStatus.ts` comment + `deriveStatus`).
- **Reads from Firestore, not Astro (FR-3)**: `data/articles.ts` reads `articles/{date}`; hero
  image is the only Astro fetch (decoupled from LCP).
- **Closed component inventory (DESIGN §2)**: only inventoried components built; `ShareSheet`
  (F-010) and supervision components (F-011) correctly deferred — `/supervision` is a labelled
  placeholder, share footer is a reserved slot.

## Cross-track impact (AD-1)

This PWA track edits `minion/` — `ArticleDoc` is promoted to `shared/schema/article.json`
(codegen → TS + Pydantic) and re-exported in `minion/publish/models.py`; the publish step maps
its generation-pipeline `ArticleFrontmatter` into the shared `Frontmatter` at the construction
boundary. Minion suite stays green (147). This was the agreed Q1 decision (single source of
truth) and is the only reason the PR touches `minion/`.

## Follow-ups (non-blocking)

1. **AC-9 device LCP** — measure on a real iPhone during F-013; trim Firebase chunk if >2s.
2. **Raster apple-touch icon** — add `apple-touch-icon.png` for older iOS home-screen polish.
3. **CI deploy** — `deploy-pwa` deploy job remains guarded; wire WIF auto-deploy in a later track.

**Verdict: Pass with notes** — all functional ACs met and verified; the single deferred item
(AC-9 on-device measurement) is documented with an owner (F-013), not silently assumed.
