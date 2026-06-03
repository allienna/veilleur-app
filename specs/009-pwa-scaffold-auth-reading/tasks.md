# Tasks: PWA scaffold + Auth + Reading

**Plan**: specs/009-pwa-scaffold-auth-reading/plan.md
**Status**: Complete
**Total**: 26 tasks across 4 phases

Conventions (CLAUDE.md): TS gates `pnpm lint` / `pnpm typecheck` / `pnpm build`; PWA unit tests `pnpm --filter @veilleur/pwa run test` (Vitest, added in T-2.1); Minion `uv run pytest` / `uv run pyright` / `uv run ruff check .` (from `minion/`); codegen `pnpm gen` + `pnpm check:codegen`; email invariant `pnpm check:email`. New deps reviewed in the PR description.

## Phase 1: Shared article contract (foundation)

- [x] **T-1.1**: Author `shared/schema/article.json`
  - **Do**: Create the JSON Schema for the `articles/{date}` document mirroring `minion/src/minion/publish/models.py::ArticleDoc` — `date`, `slug`, `theme`, nested `frontmatter` object (`title`, `date`, `description`, `tags[]`, `image`, `kind`), `body`, `linkedin`, `image`, `commit_sha` (nullable), `published` (bool). Set `additionalProperties: false` (mirrors `extra="forbid"`). Match the `$schema`/`$id`/`title`/`description` style of `shared/schema/run.json`.
  - **Test**: `npx ajv compile -s shared/schema/article.json` (or validate JSON parses); reviewed against `ArticleDoc` field-by-field.

- [x] **T-1.2**: Register `article.json` in codegen + exports
  - **Do**: Add `["article.json", "article.ts"]` to `targets` in `shared/scripts/gen-ts.mjs` and `["article.json", "article.py"]` in `gen-py.mjs`; add `"./article": "./generated/ts/article.ts"` to `shared/package.json` `exports`.
  - **Test**: `pnpm gen` runs clean and writes `generated/ts/article.ts` + `generated/veilleur_shared/article.py`.

- [x] **T-1.3**: Generate and commit article types
  - **Do**: Run `pnpm gen`; commit `shared/generated/ts/article.ts` and `shared/generated/veilleur_shared/article.py` (+ updated `__init__.py`).
  - **Test**: `pnpm check:codegen` passes (no drift); generated files present and not hand-edited.

- [x] **T-1.4**: Swap Minion `ArticleDoc` to the shared model
  - **Do**: Replace the `ArticleDoc` class in `minion/src/minion/publish/models.py` with a re-export/import of the generated `veilleur_shared` article model (keep `ArticleFrontmatter` for the generation pipeline; map into the shared type at the publish boundary). Update imports in `steps/publish.py`, `store/ports.py`, `store/memory.py`, `store/firestore.py`.
  - **Test**: `uv run pyright` and `uv run ruff check .` clean (from `minion/`).

- [x] **T-1.5**: Update Minion tests for the shared model
  - **Do**: Update `minion/tests/test_publish_models.py`, `test_article_store.py`, `test_publish_integration.py` to construct/assert the shared article type.
  - **Test**: `uv run pytest` green (from `minion/`); full Minion gate (`ruff` + `pyright` + `pytest`) passes — Phase 1 gate.

## Phase 2: App scaffold + design system

- [x] **T-2.1**: Add PWA dependencies + Vitest
  - **Do**: Add to `pwa/package.json`: `firebase`, `react-router-dom`, `tailwindcss`+`postcss`+`autoprefixer`, `vite-plugin-pwa`+`workbox-window`, `sonner`, shadcn deps (`class-variance-authority`, `clsx`, `tailwind-merge`, Radix peers); dev: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@firebase/rules-unit-testing`. Add `"test": "vitest run"` script. Install (`pnpm install`).
  - **Test**: `pnpm install` succeeds; lockfile updated; `pnpm --filter @veilleur/pwa run test` runs (0 tests OK).

- [x] **T-2.2**: Tailwind + token wiring
  - **Do**: Create `pwa/tailwind.config.ts`, `pwa/postcss.config.js`, `pwa/src/index.css` seeded from DESIGN §1 (colors base/semantic/status, spacing 4px base, radius, shadow, motion, typography, `prose-veilleur`). Add `@/` path alias in `vite.config.ts` + `tsconfig.json`.
  - **Test**: `pnpm --filter @veilleur/pwa run build` succeeds; a token utility class renders in a smoke component.

- [x] **T-2.3**: shadcn/ui init + base primitives
  - **Do**: Add `pwa/components.json`; install the base shadcn primitives the inventory wraps (`Card`, `Button`, `Badge`, `Skeleton`, `Alert`, `Sheet`, `ScrollArea`, Sonner toaster).
  - **Test**: `pnpm --filter @veilleur/pwa run typecheck` clean; a primitive imports and renders.

- [x] **T-2.4**: `vite-plugin-pwa` + iOS manifest
  - **Do**: Wire `VitePWA({ registerType: 'autoUpdate', manifest: {...} })` in `vite.config.ts`; add icons + `manifest` fields (`display: standalone`, `theme_color` from tokens, `lang: fr`); update `pwa/index.html` (`<html lang="fr">`, theme-color meta, apple-touch icons).
  - **Test**: `pnpm --filter @veilleur/pwa run build` emits `manifest.webmanifest` + service worker in `dist/`.

- [x] **T-2.5**: `react-router` tree with lazy routes
  - **Do**: Create `pwa/src/router.tsx` with `createBrowserRouter` — `/` (Today), `/history`, `/article/:date`, `/supervision` (placeholder) — all `lazy()`-loaded. Add `SupervisionPlaceholder.tsx` ("Bientôt disponible").
  - **Test**: `pnpm typecheck`; navigating each path renders its route (RTL or manual).

- [x] **T-2.6**: `AppShell` + `AppHeader`
  - **Do**: Build `AppShell` (header + main + `env(safe-area-inset-*)` paddings) and `AppHeader` (sticky; mascot, "Le Veilleur", nav `Aujourd'hui`/`Historique`/`Supervision`, 44×44pt targets, `aria-label` on icon links). Reading container `max-w-3xl mx-auto px-4 sm:px-6`.
  - **Test**: `pnpm test` — header renders three nav links; `pnpm build` green.

- [x] **T-2.7**: Reading inventory components (presentational)
  - **Do**: Build `ArticleCard`, `ArticleView` (hero + prose-veilleur + reserved share-footer slot), `TagPill`, `SkeletonCard`, `EmptyState`, `ErrorBanner` (info + error variants), `Button`, `Toast` wrapper — against fixture data, covering their DESIGN-listed states.
  - **Test**: `pnpm test` — component tests render each state (default/loading/empty/error); `pnpm lint`+`typecheck` clean — Phase 2 gate.

- [x] **T-2.8**: Auth screens (presentational)
  - **Do**: Build `SignInScreen` (Google sign-in CTA, `Card`+`Button`) and `UnauthorizedScreen` ("Non autorisé", terminal, with sign-out affordance).
  - **Test**: `pnpm test` — both render; `pnpm typecheck` clean.

## Phase 3: Auth + Firestore reading

- [x] **T-3.1**: Firebase init + config
  - **Do**: Extend `pwa/src/config.ts` with `ASTRO_IMAGES_BASE = "https://allienna.github.io/veilleur/images/posts"` (preserve the `allowed-email-pin` line untouched). Create `pwa/src/firebase.ts` initializing app + Auth + Firestore from `VITE_FIREBASE_*` (`import.meta.env`); add `pwa/.env.example`.
  - **Test**: `pnpm check:email` still passes; `pnpm typecheck` clean.

- [x] **T-3.2**: `AuthProvider` + soft allowed/verified gate
  - **Do**: Create `pwa/src/auth/AuthProvider.tsx` + `useAuth.ts` — context over `onAuthStateChanged`, `browserLocalPersistence`, Google sign-in/sign-out; expose `status: 'loading' | 'signed-out' | 'unauthorized' | 'ready'` derived from `email === ALLOWED_OPERATOR_EMAIL && email_verified`.
  - **Test**: `pnpm test` — fake auth states map to the right status (allowed→ready, non-allowed→unauthorized, unverified→unauthorized).

- [x] **T-3.3**: Wire the auth gate into `App`
  - **Do**: Replace `pwa/src/App.tsx` placeholder: wrap in `AuthProvider`; render `SignInScreen` / `UnauthorizedScreen` / `RouterProvider` by `status`.
  - **Test**: `pnpm test` — gate renders correct screen per status; `pnpm build` green.

- [x] **T-3.4**: Typed article repository
  - **Do**: Create `pwa/src/data/articles.ts` — `getArticle(date)` (doc `articles/{date}`) and `listRecentArticles(limit=30)` (ordered desc by `date`), returning the generated `@veilleur/shared/article` type; hero URL helper `heroUrl(image)` → `${ASTRO_IMAGES_BASE}/{image}`.
  - **Test**: `pnpm test` — repo against a faked Firestore returns typed docs; ordering + limit asserted.

- [x] **T-3.5**: Today route wired to Firestore
  - **Do**: Implement `Today.tsx` — fetch `articles/{today Europe/Paris}` via repo; `SkeletonCard` (≥300ms floor) → `ArticleView`; absent doc → `EmptyState` "Pas d'article aujourd'hui" + cause subline. `Intl.DateTimeFormat('fr-FR')` for dates.
  - **Test**: `pnpm test` — loading/loaded/empty paths; hero 404 still renders body.

- [x] **T-3.6**: History + Article routes wired
  - **Do**: Implement `History.tsx` (list last ~30 `ArticleCard`s desc, `compact` density, empty→`EmptyState` "Aucun article pour l'instant", card→`/article/:date`) and `Article.tsx` (`ArticleView` for `:date`, reserved share-footer slot).
  - **Test**: `pnpm test` — history lists N and links; article route renders by date; `pnpm lint`+`typecheck` clean.

- [x] **T-3.7**: Firestore Rules for `articles`
  - **Do**: In `firestore.rules` add `match /articles/{date} { allow read: if isAllowedOperator(); allow write: if false; }` above the deny-all catch-all; keep `isAllowedOperator()` and the deny-all default intact.
  - **Test**: `pnpm check:email` passes; rules file lints (emulator test in T-4.3) — Phase 3 gate.

## Phase 4: Offline, resilience, deploy, verification

- [x] **T-4.1**: SW runtime caching + offline banner
  - **Do**: Configure Workbox runtime caching (Today article doc + hero image; History last 7) in the `VitePWA` config; render info `ErrorBanner` "Mode hors ligne — article du <date>" when serving from cache / Firestore unreachable.
  - **Test**: `pnpm build`; offline simulation (DevTools offline) renders last-known article + banner.

- [x] **T-4.2**: `ErrorBoundary` + structured logging
  - **Do**: Create `pwa/src/components/ErrorBoundary.tsx` (full-page `ErrorBanner` variant + `Recharger`) wrapping the router; add `pwa/src/lib/log.ts` emitting a structured `{level:"error", event:"pwa.boundary", runId?}` line (no third-party telemetry).
  - **Test**: `pnpm test` — a throwing child renders the boundary + `Recharger`; log line shape asserted.

- [x] **T-4.3**: Firestore Rules emulator test (AC-7)
  - **Do**: Add a `@firebase/rules-unit-testing` test: allowed+verified token reads `articles/{date}` ✓; non-allowed token denied; unverified token denied; any client write denied.
  - **Test**: rules test suite passes against the Firestore emulator.

- [x] **T-4.4**: Manual deploy config + docs (AD-8)
  - **Do**: Add `firebase.json` (Hosting → `pwa/dist`, SPA rewrite) + `.firebaserc`; write/extend `pwa/README` with `VITE_FIREBASE_*` setup + `pnpm --filter @veilleur/pwa build && firebase deploy --only hosting`. Refresh the stale "wired in F-007" comment in `.github/workflows/deploy-pwa.yml` (deploy job stays `if: false`).
  - **Test**: `pnpm --filter @veilleur/pwa run build` produces `pwa/dist`; `firebase deploy --dry-run`-equivalent config validates; CI `deploy-pwa` build job still green.

- [x] **T-4.5**: Performance measurement (AC-9)
  - **Do**: Measure cold-start LCP (throttled iPhone-4G profile, Lighthouse) and SW-cached reload; document the method + numbers in `pwa/README` (or a short `specs/009-.../perf.md`). If ≤2s / ≤500ms unmet, record as a known gap deferred to F-013.
  - **Test**: documented LCP + cached-reload figures with the measurement command.

- [x] **T-4.6**: Full-feature gate
  - **Do**: Run the whole suite; confirm all 11 ACs demonstrable and the five DESIGN §4 states present on every shipped view.
  - **Test**: `pnpm lint && pnpm typecheck && pnpm build && pnpm --filter @veilleur/pwa run test && pnpm check:email && pnpm check:codegen` all green; Minion gate green; AC checklist ticked.
