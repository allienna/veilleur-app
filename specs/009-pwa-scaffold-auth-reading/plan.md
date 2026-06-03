# Plan: PWA scaffold + Auth + Reading

**Spec**: specs/009-pwa-scaffold-auth-reading/spec.md

Implements F-009 on top of the existing `pwa/` skeleton (React 18 + TS + Vite, `strict`, `@veilleur/shared` wired). Reads `articles/{date}` from Firestore behind Firebase Auth; activates Firestore Rules for the `articles` collection (the real boundary). All five open questions resolved in the spec (2026-06-03).

## Architecture Decisions

### AD-1: Promote `ArticleDoc` to the shared schema (Q1)
- **Choice**: Add `shared/schema/article.json` as the JSON-Schema source of truth; register it in both codegen scripts (`shared/scripts/gen-ts.mjs` targets, `gen-py.mjs` targets) and `shared/package.json` `exports` (`./article`). `pnpm gen` emits `generated/ts/article.ts` + `generated/veilleur_shared/article.py`. Replace the Minion-internal `ArticleDoc` (`minion/src/minion/publish/models.py`) with the generated Pydantic model across all consumers; the PWA imports `@veilleur/shared/article`.
- **Rationale**: Single source of truth (CLAUDE.md, constitution §4); `check:codegen` then guards PWA↔Minion drift on the document both sides depend on. Mirrors the existing `run.json` pattern exactly.
- **Alternatives considered**: PWA-local hand-authored TS type — rejected (two definitions, manual sync, promotion still owed). 
- **Note**: `ArticleDoc` nests `ArticleFrontmatter` (`minion/src/minion/generate/models.py`). The schema embeds frontmatter inline as a nested object (`{title, date, description, tags[], image, kind}`); Minion keeps `ArticleFrontmatter` for the generation pipeline and maps into the shared type at the publish boundary. `extra="forbid"` semantics preserved via `additionalProperties: false`.

### AD-2: Firestore Rules — `articles` read-only for the operator (FR-4)
- **Choice**: In `firestore.rules`, add `match /articles/{date} { allow read: if isAllowedOperator(); allow write: if false; }` above the deny-all catch-all. Reuse the existing `isAllowedOperator()` (already checks `email == <allowed> && email_verified`). Other collections stay deny-all.
- **Rationale**: The Rules are the authoritative boundary (constitution §2.1); the PWA client check is UX-only. Minion writes server-side via privileged SA (bypasses Rules), so client-write-denied is correct.
- **Alternatives considered**: Per-document field validation on read — unnecessary; reads are all-or-nothing for a single operator.

### AD-3: Auth gate as a top-level provider, not per-route guards
- **Choice**: A single `AuthProvider` (React context over Firebase `onAuthStateChanged`) wraps the app. Render tree: unauthenticated → `SignInScreen`; authenticated + (non-allowed ∥ unverified) → `UnauthorizedScreen`; authenticated + allowed + verified → routed `AppShell`. Firebase `browserLocalPersistence` for sign-in-once.
- **Rationale**: Three routes don't justify per-route guards; a single gate keeps the boundary in one place and matches the spec's "gates the whole app".
- **Alternatives considered**: Route-level loaders/guards (react-router) — more moving parts for no benefit at this scale.

### AD-4: `react-router-dom` with lazy routes (Q2)
- **Choice**: `createBrowserRouter` with three routes — `/` (Today), `/history`, `/article/:date` — plus a `/supervision` placeholder. Route components `lazy()`-loaded so the Today path ships the smallest first chunk (LCP).
- **Rationale**: Standard, history-API, code-splitting helps the ≤2s LCP target (AC-9).

### AD-5: Firestore reads via typed repository module (`articleRepo`)
- **Choice**: A thin `pwa/src/data/articles.ts` exposing `getArticle(date)` and `listRecentArticles(limit=30)`, returning the generated `Article` type. UI never touches the Firebase SDK directly.
- **Rationale**: Isolates the SDK, keeps components testable with a faked repo, centralizes the `date`-keyed query and ordering.

### AD-6: `vite-plugin-pwa` (Workbox) for SW + manifest + offline (FR-1, FR-5)
- **Choice**: `registerType: 'autoUpdate'`; precache the app shell; runtime-cache the Today article (Firestore + hero image) with a `StaleWhileRevalidate`/`NetworkFirst` strategy; web-app manifest for iOS home-screen install (`display: standalone`, icons, `theme_color` from DESIGN tokens). Offline render surfaces the info `ErrorBanner`.
- **Rationale**: Standard Vite PWA path; Workbox covers shell precache + runtime caching for the ≤500ms cached reload (AC-9) and offline (AC-10).

### AD-7: Tailwind + shadcn/ui aligned to DESIGN tokens
- **Choice**: Install Tailwind + shadcn/ui; seed `tailwind.config` from DESIGN §1 tokens (colors base/semantic/status, spacing 4px base, radius, shadow, motion, typography). Build the inventory components (§2) as thin wrappers over shadcn primitives. `<html lang="fr">`; `Intl.DateTimeFormat('fr-FR')` for dates.
- **Rationale**: DESIGN §2 is a closed inventory mapping each component to a shadcn base; this is the prescribed path. Token alignment preserves visual lineage with the Astro site (DESIGN §6).

### AD-8: Manual deploy path; CI deploy stays guarded (Q4)
- **Choice**: Add `firebase.json` (Hosting → `pwa/dist`, SPA rewrite) + `.firebaserc`; document `pnpm --filter @veilleur/pwa build && firebase deploy --only hosting` in `pwa/README`. Leave `deploy-pwa.yml` deploy job `if: false` (update its stale "wired in F-007" comment to point at the manual path / future track).
- **Rationale**: Gets the PWA onto a real iPhone (roadmap "first PWA on real device") without committing CI secrets/automation this track.

## Affected Files

### New Files
| File | Purpose |
|---|---|
| `shared/schema/article.json` | JSON-Schema source of truth for the `articles/{date}` document (AD-1) |
| `shared/generated/ts/article.ts` | Codegen output (committed); PWA imports |
| `shared/generated/veilleur_shared/article.py` | Codegen output (committed); Minion imports |
| `pwa/tailwind.config.ts`, `pwa/postcss.config.js` | Tailwind config seeded from DESIGN tokens (AD-7) |
| `pwa/components.json` | shadcn/ui config |
| `pwa/src/index.css` | Tailwind layers + DESIGN token CSS vars + `prose-veilleur` |
| `pwa/src/config.ts` *(extend)* | add `ASTRO_IMAGES_BASE` + Firebase config reader (Q3/Q5) |
| `pwa/src/firebase.ts` | Firebase app + Auth + Firestore init from `VITE_FIREBASE_*` |
| `pwa/src/auth/AuthProvider.tsx`, `useAuth.ts` | Auth context + soft allowed/verified check (AD-3) |
| `pwa/src/data/articles.ts` | Typed Firestore article repository (AD-5) |
| `pwa/src/router.tsx` | `react-router` route tree + lazy routes (AD-4) |
| `pwa/src/components/` | `AppShell`, `AppHeader`, `ArticleCard`, `ArticleView`, `SkeletonCard`, `EmptyState`, `ErrorBanner`, `TagPill`, `Button`, `Toast`, `SignInScreen`, `UnauthorizedScreen`, `ErrorBoundary` |
| `pwa/src/routes/` | `Today.tsx`, `History.tsx`, `Article.tsx`, `SupervisionPlaceholder.tsx` |
| `pwa/src/lib/log.ts` | Structured `pwa.boundary` logging client (DESIGN §4) |
| `pwa/public/manifest` assets + icons | iOS home-screen install (AD-6) |
| `firebase.json`, `.firebaserc` | Hosting config for manual deploy (AD-8) |
| `pwa/.env.example` | Documented `VITE_FIREBASE_*` keys (Q3) |
| `pwa/src/**/__tests__/*` | Vitest unit tests (see Test Strategy) |

### Modified Files
| File | Change |
|---|---|
| `pwa/package.json` | add deps: `firebase`, `react-router-dom`, `tailwindcss`, `vite-plugin-pwa`, `sonner`, shadcn deps; add `test` script (Vitest) |
| `pwa/vite.config.ts` | wire `VitePWA(...)` plugin + path alias `@/` |
| `pwa/src/App.tsx` | replace placeholder with `AuthProvider` + `RouterProvider` |
| `pwa/index.html` | `<html lang="fr">`, manifest link, theme-color, icons |
| `firestore.rules` | add `articles` read rule via `isAllowedOperator()` (AD-2) |
| `shared/scripts/gen-ts.mjs`, `gen-py.mjs` | add `article.json` to `targets` |
| `shared/package.json` | add `./article` to `exports` |
| `minion/src/minion/publish/models.py` | replace `ArticleDoc` with import of generated shared model (AD-1) |
| `minion/.../steps/publish.py`, `store/ports.py`, `store/memory.py`, `store/firestore.py` | update `ArticleDoc` imports to shared type |
| `minion/tests/test_publish_models.py`, `test_article_store.py`, `test_publish_integration.py` | update to shared type |
| `.github/workflows/deploy-pwa.yml` | refresh stale "wired in F-007" comment; deploy job stays `if: false` (AD-8) |
| `pwa/README` (new or extend) | manual deploy + `VITE_FIREBASE_*` docs |

## Implementation Phases

### Phase 1: Shared article contract (foundation)
- Author `shared/schema/article.json` (mirror `ArticleDoc` incl. nested frontmatter); register in both gen scripts + `exports`; run `pnpm gen`; commit generated TS + Python.
- Swap Minion `ArticleDoc` → generated shared model across `publish/models.py` + store + steps; update Minion tests. Run `uv run pytest`, `pyright`, `ruff` and `pnpm check:codegen` green.
- *Gate*: codegen-sync CI passes; Minion suite green. This phase de-risks the cross-boundary change before any UI.

### Phase 2: App scaffold + design system
- Add Tailwind + shadcn/ui + token wiring (`tailwind.config`, `index.css`, `components.json`); `vite-plugin-pwa` + manifest + icons; `react-router` tree with lazy routes; `AppShell` + `AppHeader` (nav, safe-area). Placeholder Supervision route.
- Build the DESIGN §2 inventory components (presentational, with all relevant states) against fixture data.
- *Gate*: `pnpm lint/typecheck/build` green; app renders shell + routes with mock data.

### Phase 3: Auth + Firestore reading (business logic)
- `firebase.ts` init from env; `AuthProvider` + soft allowed/verified gate; `SignInScreen` / `UnauthorizedScreen` (AD-3).
- `articles.ts` repository; wire `Today`, `History`, `Article` routes to real Firestore reads with `SkeletonCard` / `EmptyState` / `ErrorBanner` states; hero image resolution via `ASTRO_IMAGES_BASE`.
- `firestore.rules` `articles` read rule (AD-2).
- *Gate*: end-to-end sign-in → read flow works against a real/emulated Firestore.

### Phase 4: Offline, resilience, deploy, verification
- SW runtime caching for Today article + offline `ErrorBanner`; `ErrorBoundary` + `pwa.boundary` log line.
- `firebase.json` + `.firebaserc` + `pwa/README` manual-deploy + env docs.
- Firestore Rules test proving a non-allowed token is rejected (AC-7); LCP/cached-reload measurement on throttled profile, method documented (AC-9); `pnpm check:email` green (AC-8).
- *Gate*: all 11 ACs demonstrable.

## Design Mobilization

- **Tokens used**: colors (base palette, semantic, run-status — status only referenced, supervision is F-011), typography scale, spacing (4px base), radius, shadow, motion (incl. `prefers-reduced-motion`), density (`regular` on `/`, `compact` on `/history`). Source: DESIGN §1.
- **Components used** (DESIGN §2 inventory — **all present, no `/design update` needed**): `AppShell`, `AppHeader`, `ArticleCard`, `ArticleView`, `SkeletonCard`, `EmptyState`, `ErrorBanner`, `TagPill`, `Button`, `Toast`, `SignInScreen`, `UnauthorizedScreen`. Reserved (not built here): `ShareSheet` (F-010), `RunTimeline`/`RunStepRow`/`StatusPill`/`RunNowButton` (F-011).
- **Surfaces touched**: `pwa` (primary). Token-only alignment with `astro-site` (hero images, prose-veilleur). No `minion` UI.
- **States covered**: loading (`SkeletonCard` ≥300ms floor), empty (`EmptyState`), error (`ErrorBanner` + `ErrorBoundary`), success (article render; no celebratory toast on reading), offline (SW cache + info `ErrorBanner`). All five — enforced by `/review` (AC-11).
- **A11y notes**: `<html lang="fr">`; WCAG AA contrast on every token; `:focus-visible` ring; 44×44pt touch targets; `aria-label` on icon-only buttons; `prefers-reduced-motion` disables pulse/slide; status never color-only (relevant when F-011 adds StatusPill — keep the verb+color convention in shared components). DESIGN §5.

## Test Strategy

- **Mocking approach**: Vitest + React Testing Library (add to `pwa/`, matching the repo's per-workspace test convention). Firebase Auth and Firestore faked at the `AuthProvider` / `articleRepo` seams (inject fakes, don't hit network) — mirrors Minion's `fakes.py` port-faking style. Firestore Rules tested with `@firebase/rules-unit-testing` against the emulator.
- **Happy paths**: Today renders a fetched `Article`; History lists N articles descending and links to `/article/:date`; allowed+verified identity reaches AppShell; sign-in persists.
- **Error scenarios**: missing today doc → `EmptyState`; non-allowed/unverified → `UnauthorizedScreen`; Firestore unreachable → SW cache + offline banner; hero 404 → text still renders (LCP independent of image); component throw → `ErrorBoundary` + `Recharger`.
- **Edge cases**: empty history → `EmptyState` (no CTA); `skipped: no_sources` day (no doc) vs pre-cron (no doc) cause sublines; `published: false` article handling; date-boundary (Europe/Paris "today" vs UTC); reduced-motion path.
- **Rules test (AC-7)**: allowed+verified token reads `articles/{date}` ✓; non-allowed and unverified tokens denied; any client write denied.

## Risk & Complexity

- **Estimated complexity**: **High** (roadmap size L). First PWA surface — stack bring-up (Tailwind/shadcn/PWA/router/Firebase) + a cross-boundary schema change + auth + Rules in one track.
- **Key risks**:
  - *Cross-boundary schema swap (AD-1)* touches 8 Minion files + tests; mitigate by doing it first (Phase 1) behind `check:codegen` + Minion suite before any UI work.
  - *LCP ≤2s on 4G (AC-9)* is demanding for a first-load React+Firebase app; mitigate with lazy routes, Firestore-not-Astro reads, hero image decoupled from LCP, SW precache. Measurement method documented; if unmet, record as a known gap for hardening (F-013) rather than blocking.
  - *iOS PWA install + Firebase Auth popup quirks* (popup vs redirect on installed PWA); plan to test redirect flow on real iOS.
  - *Firestore Rules lockout* — verify the operator's real verified email matches the pin before relying on it; emulator test guards regressions.
- **New dependencies** (reviewed in PR per CLAUDE.md): `firebase`, `react-router-dom`, `tailwindcss` + `postcss`/`autoprefixer`, `vite-plugin-pwa` (+ `workbox-window`), `sonner`, shadcn/ui primitives (`class-variance-authority`, `clsx`, `tailwind-merge`, Radix peers), and dev: `vitest`, `@testing-library/react`, `@firebase/rules-unit-testing`.

## Review

Spec status set to **Approved**; roadmap F-009 → **Planning**. Review this plan; once approved, run `/tasks 009-pwa-scaffold-auth-reading`.
