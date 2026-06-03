# Spec: PWA LinkedIn Share (two-tap)

**Track ID**: 010-pwa-linkedin-share
**Roadmap ref**: F-010
**Status**: Complete (reviewed Pass-with-notes; 8 automated ACs met; AC-7 on-device ≤30s flow deferred to F-013 device pass)
**Created**: 2026-06-03
**Branch**: feat/010-pwa-linkedin-share
**PRD sections**: FR-C1 (User Story C)
**Depends on**: F-009 PWA scaffold + Auth + Reading — **Complete** (merged #13)

## Context

The operator's morning ritual ends at the share step: read the overnight article on the
iPhone PWA, then post it to LinkedIn in under 30 seconds. iOS forbids writing both text and
an image to the clipboard in one gesture and blocks programmatic clipboard-image writes
entirely, so the PRD mandates **two distinct, explicit actions** rather than a single
"share everything" affordance: copy the post text, then save the hero image to Photos.

F-009 left an explicit, tested seam for this: `ArticleView` renders
`<footer data-testid="share-footer-slot">` and its source comment reserves it for the
F-010 ShareSheet. The `Article` document already carries the two payloads this feature
consumes — `article.linkedin` (ready-to-post text, ≤3000 chars) and `article.image`
(hero filename, resolved to a public URL via `heroUrl`). `sonner` (the `Toast` toaster)
is already a dependency. This feature wires the share UI into that seam; it introduces no
new data, no Firestore reads, and no server-side surface.

## User Stories

- As the operator, I want one tap to copy the LinkedIn post to my iOS clipboard so that I
  can paste it straight into the LinkedIn app with no confirmation dialog in the way.
- As the operator, I want a second tap to save the hero image to my Photos so that I can
  attach it to the LinkedIn post.
- As the operator, I want a clear confirmation after each action so that I know the copy /
  save succeeded before I switch apps.

## Functional Requirements

### FR-1: ShareSheet component
A bottom-sheet (`ShareSheet`, DESIGN §3) presenting exactly two actions —
**"Copier le post"** and **"Enregistrer l'image"** — opened from the `ArticleView` share
footer. State model per DESIGN §3: `open, copying, copied, saving, saved, error`. Built on a
`Sheet` primitive (see Design References — `Sheet` is **not yet** in the UI inventory).
Honors `prefers-reduced-motion` (no slide-in; DESIGN §accessibility).

### FR-2: Copy post → clipboard
The copy action writes `article.linkedin` to the clipboard via the async Clipboard API
(`navigator.clipboard.writeText`) with **no confirmation dialog** (PRD FR-C1). On success,
fire `Toast.success` "Post copié" (2s; DESIGN §interactions). On failure (permission /
insecure context), fire `Toast.error` and leave the sheet open so the operator can retry.

### FR-3: Save image → iOS Photos
The save action delivers the hero image (`heroUrl(article.image)`) to iOS Photos. Primary
path: **Web Share API** (`navigator.share` with a `File`) so iOS shows its native sheet
including "Save Image" — per DESIGN §interactions, on iOS the OS sheet *replaces* the toast.
Fallback when the file-share path is unavailable: `<a download>` to trigger a save. On the
non-iOS / `<a download>` path, fire `Toast.success` "Image enregistrée" (2s). The image must
be fetched as a blob before sharing (cross-origin public Astro URL).

### FR-4: Wire into ArticleView footer
Render `ShareSheet` (or its trigger button) inside the existing
`<footer data-testid="share-footer-slot">` in `ArticleView`. No layout regression to the
reader; the footer remains below the prose. Sheet is dismissible without acting.

## Design References

| Surface | Components used | New components needed |
|---------|-----------------|-----------------------|
| `ArticleView` share footer | `ShareSheet` (DESIGN §3), `Toast`/`Sonner` (installed), `Button` (`pwa/src/components/ui/button.tsx`) | **`ShareSheet`** (new — `pwa/src/components/`); **`Sheet`** UI primitive (new — `pwa/src/components/ui/sheet.tsx`; not in `ui/` inventory). DESIGN §3 lists `ShareSheet` as built on a shadcn `Sheet`. |

> **Inventory gap:** `ShareSheet` is named in DESIGN §3 but the underlying `Sheet` primitive
> is not present in `pwa/src/components/ui/`. `Sheet` is a standard shadcn/ui component
> (Radix Dialog–based) and is consistent with the existing inventory (`Button`, `Card`,
> `Badge`, `Skeleton`, `Alert` are all already vendored the same way), so this is an
> *additive vendor*, not a design-token change — no `/design update` required. Confirm during
> `/plan` whether to add `@radix-ui/react-dialog` (+ optionally `lucide-react` for icons) or
> hand-roll a minimal sheet.

## Error Scenarios

- **Clipboard write rejected** (no permission / non-secure context): `Toast.error`, sheet
  stays open, action retryable. No banner (DESIGN: single transient call → toast, not banner).
- **Image fetch fails** (network / hero 404): `Toast.error` "Image indisponible"; copy action
  still works independently. Mirrors F-009's hero-failure tolerance (reader never blanks).
- **`navigator.share` unavailable or user-cancelled**: fall back to `<a download>`; a
  user-cancelled OS sheet is a no-op (no error toast).
- **No `article.linkedin` / `article.image`** (schema guarantees both `required`, but defensive):
  disable the corresponding action rather than throwing.

## Acceptance Criteria

- [ ] AC-1: Opening an article shows a share affordance in the `ArticleView` footer that opens
  the `ShareSheet` with two actions: "Copier le post" and "Enregistrer l'image".
- [ ] AC-2: Tapping "Copier le post" writes `article.linkedin` to the clipboard with no
  confirmation dialog and shows `Toast.success` "Post copié".
- [ ] AC-3: Tapping "Enregistrer l'image" invokes the Web Share API with the hero image file
  when available; otherwise falls back to `<a download>`.
- [ ] AC-4: A failed clipboard write surfaces `Toast.error` and leaves the sheet open
  (retryable), with no error banner.
- [ ] AC-5: A failed image fetch surfaces a `Toast.error` and does not break the copy action.
- [ ] AC-6: `prefers-reduced-motion: reduce` disables the sheet slide-in (static present).
- [ ] AC-7: The whole open→copy→save flow is completable in ≤30s on iOS Safari (PRD §C).
- [ ] AC-8: `pnpm lint`, `pnpm typecheck`, and `pnpm --filter @veilleur/pwa run build` pass;
  unit tests cover copy success/failure and the share/`<a download>` branch (mocked
  `navigator.clipboard` / `navigator.share`).
- [ ] AC-9: No `any`, no `@ts-ignore` (constitution §4 / CLAUDE.md TS conventions).

## Out of Scope

- LinkedIn API auto-posting / OAuth — explicitly a manual copy/paste flow (PRD §C, §non-goals).
- Engagement analytics (likes/reach) — PRD non-goal.
- Sharing to any network other than LinkedIn.
- Tracking the shared/published ratio metric (a posteriori; not a PWA concern here).
- Desktop-optimised share UX — mobile-first; desktop just needs to not break.

## Open Questions

_All resolved during `/plan` (2026-06-03) — see plan.md AD-1, AD-4, AD-2:_

- **OQ-1 → RESOLVED**: Hand-roll a minimal `Sheet` with `cva` (no Radix). The existing `ui/`
  inventory is hand-rolled with `class-variance-authority`; there is no Radix in the tree, so
  hand-rolling is the consistent, dependency-free choice.
- **OQ-2 → RESOLVED**: Add `lucide-react` for the share/copy/save icons.
- **OQ-3 → RESOLVED**: An always-visible "Partager" footer `Button` opens the `ShareSheet`
  (matches DESIGN's `open` sheet state).
