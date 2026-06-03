# Spec: PWA scaffold + Auth + Reading

**Track ID**: 009-pwa-scaffold-auth-reading
**Roadmap ref**: F-009
**Status**: Complete (reviewed Pass-with-notes; 11 ACs met; AC-9 on-device LCP deferred to F-013)
**Created**: 2026-06-03
**Branch**: feat/009-pwa-scaffold-auth-reading
**PRD sections**: FR-B1 (reading surface), FR-F1 (mono-tenant auth), §5 (architecture / PWA tech stack), §4 (performance: LCP ≤2s)
**Depends on**:
- **F-002** Monorepo scaffold — **Complete** (merged; `pwa/` skeleton + `pwa/src/config.ts` allowed-email pin already exist).
- **F-006** Imagen + GitHub publish — **Complete** (merged; writes `articles/{date}` to Firestore — the documents this PWA reads).

## Context

The Minion pipeline (F-001→F-008) is fully on `main`: a daily run produces an article, publishes it to the public Astro site, and persists the canonical reading copy to Firestore `articles/{date}` (`ArticleDoc`, see `minion/src/minion/publish/models.py`). Nothing yet **consumes** that data on a phone.

F-009 stands up the PWA shell and the operator's primary daily surface: **sign in once, read today's article, browse the last ~30**. It is the first vertical slice of the PWA track and the foundation every later PWA feature builds on (F-010 share, F-011 supervision/trigger, F-012 push).

Two hard constraints frame the work:
1. **Defense-in-depth auth (constitution §2.1, FR-F1).** The real boundary is Firestore Security Rules; the PWA client check is UX-only. This track *activates* the Firestore Rules (currently deny-all) for the `articles` collection and wires the client soft-check + `SignInScreen` / `UnauthorizedScreen`.
2. **iPhone-first performance (PRD §4).** LCP ≤2s on iPhone 4G cold start; SW-cached reload ≤500ms. This drives the reading-from-Firestore decision (not the Astro site) and the `vite-plugin-pwa` service-worker setup.

This is a `pwa`-surface feature; it reads from Firestore and resolves hero images from the public Astro site. It does **not** write to Firestore, trigger runs, or supervise runs (those are F-011).

## User Stories

- As the operator, I want to sign in with Google once on my iPhone and install the PWA to my home screen, so that my daily reading lives in a single iOS-native-feeling surface (FR-F1).
- As the operator, I want today's article to appear within ≤2s on a cold 4G open, so that reading never feels like waiting (FR-B1).
- As the operator, I want to browse the last ~30 articles in a history list and open any one full-screen, so that I can catch up on days I missed (FR-B1).
- As a non-allowed visitor, I want to be cleanly refused (not silently broken), so that the mono-tenant boundary is obvious and trustworthy (FR-F1).
- As the operator, I want the last-known article to remain readable offline, so that a tunnel or dead zone doesn't blank the app (DESIGN §4 Offline/Degraded).

## Functional Requirements

### FR-1: PWA application shell
Stand up the runnable React 18 + TS + Vite app on top of the existing `pwa/` skeleton, adding the production stack: **Tailwind CSS**, **shadcn/ui**, and **`vite-plugin-pwa`** (service worker + web-app manifest for iOS home-screen install). Implement `AppShell` (header + main + iOS safe-area paddings) and `AppHeader` (sticky: mascot, "Le Veilleur", nav targets `Aujourd'hui` / `Historique` / `Supervision`). Client-side routing for `/` (Today), `/history` (History), and `/article/{date}` (full reader). The `Supervision` nav target is present but routes to a placeholder/"bientôt disponible" view (its real surface is F-011) — it must exist in the header per DESIGN §3 without implying scope creep.

### FR-2: Firebase Auth (Google sign-in) + client soft-check
Integrate the Firebase JS SDK. Unauthenticated users see `SignInScreen` (Google sign-in, gates the whole app). On successful sign-in, the PWA does a **soft client-side check** against `ALLOWED_OPERATOR_EMAIL` (`pwa/src/config.ts`, already pinned) **and** `email_verified`; a signed-in but non-allowed/unverified identity terminates at `UnauthorizedScreen` ("Non autorisé"). Auth state persists across reloads (Firebase local persistence) so the operator signs in once. This client check is **UX only** — it is explicitly *not* the security boundary (FR-4 is).

### FR-3: Reading surface (Today + History) from Firestore
Read article documents from Firestore `articles/{date}` (the `ArticleDoc` shape; see Data Contract below) — **never** from the public Astro site, for low-latency iPhone reads.
- **Today** (`/`): the `articles/{today-Europe/Paris}` document rendered as the primary surface via `ArticleView` (hero image, prose body). `SkeletonCard` during fetch (≥300ms floor, never a spinner). If no document exists for today (before the cron run, or `skipped: no_sources`): `EmptyState` "Pas d'article aujourd'hui" with cause subline.
- **History** (`/history`): the last ~30 articles by descending date as a list of `ArticleCard`s (each: title, date, theme `TagPill`, hero thumbnail). Tapping a card opens `/article/{date}`. `EmptyState` "Aucun article pour l'instant" when empty.
- **Full reader** (`/article/{date}`): `ArticleView` for any historical article. A footer placeholder reserves space for the F-010 `ShareSheet` (not implemented here).
- Hero images are resolved from the `ArticleDoc.image` filename against the public Astro images base URL (the WebP committed by F-006), **not** stored in Firestore.

### FR-4: Firestore Security Rules for `articles` (the real boundary)
Replace the deny-all skeleton in `firestore.rules` for the `articles` collection with read access gated by the existing `isAllowedOperator()` function (`email == <allowed> && email_verified == true`). Writes from any client stay denied (only the Minion job's privileged SA writes articles, server-side, bypassing rules). The allowed-email value must remain byte-identical across the three pinned locations — `pnpm check:email` must still pass. Reading and the deny-all default for every other collection are preserved.

### FR-5: Offline / service-worker caching
The service worker caches the app shell and the last-known Today article so a cold offline open still renders it, with an info-variant `ErrorBanner` "Mode hors ligne — article du <date>" (DESIGN §4). History is cached for at least the last 7 entries. SW-cached reload target ≤500ms (PRD §4). A component crash is caught by an `ErrorBoundary` rendering the full-page `ErrorBanner` variant with a `Recharger` action and emitting a structured `pwa.boundary` log line (DESIGN §4 Error).

## API / Data Contract

The PWA is a **read-only Firestore client** for this track. No HTTP endpoints are called (trigger-api is F-011).

| Source | Access | Path | Purpose |
|---|---|---|---|
| Firestore | client read (gated by Rules) | `articles/{date}` | Today + history article documents (`ArticleDoc`) |
| Firebase Auth | client | Google provider | Sign-in, JWT with `email` + `email_verified` claims |
| Public Astro site | `<img>` GET | `…/veilleur/images/posts/{date}.webp` | Hero image resolved from `ArticleDoc.image` filename |

**`articles/{date}` document shape** (canonical source: `minion/src/minion/publish/models.py::ArticleDoc`; Firestore key is `date`):

| Field | Type | Notes |
|---|---|---|
| `date` | string `YYYY-MM-DD` | Document key; idempotency key |
| `slug` | string | URL slug |
| `theme` | string | Rendered as `TagPill` |
| `frontmatter` | object | `{ title, date, description, tags[], image, kind }` (Astro content-collection frontmatter) |
| `body` | string | Article markdown/HTML body (prose-veilleur tokens) |
| `linkedin` | string | LinkedIn post text (consumed by F-010, not here) |
| `image` | string | Hero image filename, e.g. `2026-06-01.webp` (resolve to Astro public URL) |
| `commit_sha` | string \| null | Set once the GitHub commit lands |
| `published` | boolean | `true` = live on the site |

**Open decision (see Open Questions):** whether to promote `ArticleDoc` to a shared `shared/schema/article.json` (codegen → TS) now, or hand-author a TS type in the PWA and defer promotion. The PWA must consume a typed contract either way; `strict: true` / no `any`.

## Design References

Per DESIGN.md §2 (closed inventory) — every component this feature needs is already inventoried; **no `/design update` required**.

| Surface (route) | Components used | New components needed |
|---|---|---|
| App-wide chrome | `AppShell`, `AppHeader` | — |
| Auth gate | `SignInScreen`, `UnauthorizedScreen` | — |
| Today (`/`) | `ArticleView`, `SkeletonCard`, `EmptyState`, `ErrorBanner`, `TagPill` | — |
| History (`/history`) | `ArticleCard`, `SkeletonCard`, `TagPill`, `EmptyState` | — |
| Full reader (`/article/{date}`) | `ArticleView`, `TagPill` (+ reserved `ShareSheet` slot, impl F-010) | — |
| Cross-cutting | `Button`, `Toast` (Sonner), `ErrorBanner` (ErrorBoundary) | — |

Layout/tokens: `max-w-3xl mx-auto px-4 sm:px-6` reading container; `regular` density on `/`, `compact` on `/history`; iOS `env(safe-area-inset-*)` on `AppHeader`; `<html lang="fr">` with `Intl.DateTimeFormat('fr-FR')` for dates (DESIGN §3, §5). Visual lineage with the external Astro site (header-only chrome, `ArticleCard.astro`, `TagPill.astro`, `prose-veilleur` tokens — DESIGN §6).

## Error Scenarios

- **No article for today** → `EmptyState` "Pas d'article aujourd'hui" + cause subline (cron not yet run / no source). Not an error banner. (`RunNowButton` CTA is deferred to F-011.)
- **Signed in but non-allowed / unverified email** → `UnauthorizedScreen` (terminal, but offers sign-out). Firestore Rules independently reject the reads regardless.
- **Firestore unreachable** → fall back to SW cache; info `ErrorBanner` "Mode hors ligne". No dead-end (DESIGN §4 Offline).
- **Hero image 404** (commit lag / placeholder) → graceful `<img>` fallback, never a broken-image glyph; article text still renders (LCP must not depend on the image).
- **Component crash** → `ErrorBoundary` → full-page `ErrorBanner` + `Recharger`; structured `pwa.boundary` log line (no third-party telemetry — DESIGN §4).
- **Auth popup blocked / cancelled on iOS** → return to `SignInScreen` with a retry affordance, no crash.

## Acceptance Criteria

- [ ] AC-1: `pnpm --filter @veilleur/pwa run dev` serves a runnable app; `pnpm lint`, `pnpm typecheck`, and `pnpm build` all pass for `pwa/` with `strict: true`, no `any`, no `@ts-ignore`.
- [ ] AC-2: The PWA installs to an iOS home screen (valid web-app manifest + service worker via `vite-plugin-pwa`); `<html lang="fr">`.
- [ ] AC-3: An unauthenticated visitor sees `SignInScreen`; Google sign-in succeeds and persists across reload (sign in once).
- [ ] AC-4: A signed-in **allowed + verified** identity reaches the Today view; a signed-in **non-allowed or unverified** identity terminates at `UnauthorizedScreen`.
- [ ] AC-5: Today view renders `articles/{today}` via `ArticleView` with hero image + body; shows `SkeletonCard` while loading and `EmptyState` when today's document is absent.
- [ ] AC-6: History view lists the last ~30 articles (≥7 minimum, descending date) as `ArticleCard`s; tapping one opens `/article/{date}` in `ArticleView`.
- [ ] AC-7: `firestore.rules` allows `articles` **reads** only for `email == <allowed> && email_verified == true`, denies all client writes, preserves deny-all for other collections; emulator/test proves a non-allowed token is rejected.
- [ ] AC-8: `pnpm check:email` passes — the allowed-email value stays byte-identical across `firestore.rules`, `trigger-api/src/auth.ts`, `pwa/src/config.ts`.
- [ ] AC-9: Cold-start LCP ≤2s and SW-cached reload ≤500ms measured on a throttled (iPhone 4G) profile; the measurement method is documented in the plan.
- [ ] AC-10: Offline cold open renders the last-known Today article with the info `ErrorBanner`; an `ErrorBoundary` catches component crashes and offers `Recharger`.
- [ ] AC-11: All five DESIGN §4 states (loading, empty, error, success, offline) are honored on every view this feature ships (enforced by `/review`).

## Out of Scope

- **LinkedIn share** (`ShareSheet`, copy/save actions) — F-010. A footer slot is reserved only.
- **Live supervision, RunTimeline, RunStepRow, StatusPill, run history** — F-011. The `Supervision` nav target is a placeholder.
- **Manual trigger / `RunNowButton` / trigger-api calls** — F-011.
- **Push notifications / VAPID / SW push handler** — F-012.
- **Writing to Firestore** from the PWA (this track is read-only).
- **Firebase Hosting deploy / CI deploy job** — the `deploy-pwa` workflow deploy step stays guarded; confirm scope with Open Question Q4.
- **Dark mode polish beyond token wiring** — tokens exist in DESIGN §1; full theming is not gated here.

## Open Questions — RESOLVED 2026-06-03

- **Q1 — Article type contract → PROMOTE.** Add `shared/schema/article.json` as the source of truth; `pnpm gen` emits `generated/ts/article.ts` (PWA imports) + `generated/python/.../article.py` (Minion `ArticleDoc` replaced). `check:codegen` guards drift. This track edits the Minion publish model and its consumers.
- **Q2 — Routing → `react-router-dom`.** History-API routing with `lazy()` route chunks to help LCP.
- **Q3 — Firebase config → `VITE_FIREBASE_*` env vars** documented in `pwa/README`, loaded via `import.meta.env`. (Non-secret, single prod project.)
- **Q4 — Deploy boundary → manual deploy path only.** Ship `firebase.json` + hosting config + documented `pnpm build && firebase deploy` in `pwa/README`. The CI `deploy-pwa` deploy job **stays guarded** (`if: false`); CI automation deferred to a later track.
- **Q5 — Astro images base → `ASTRO_IMAGES_BASE` constant in `pwa/src/config.ts`** = `https://allienna.github.io/veilleur/images/posts` (hero resolved as `${ASTRO_IMAGES_BASE}/{date}.webp`).

## Review

**Status: Complete.** This spec was specified → planned → implemented → reviewed (Pass-with-notes)
→ shipped (PR #13). See `review.md` / `qa-report.md`. The single deferred item is AC-9 (on-device
LCP), tracked to F-013. No further action on this track.
