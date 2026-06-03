# Plan: PWA LinkedIn Share (two-tap)

**Spec**: specs/010-pwa-linkedin-share/spec.md

## Architecture Decisions

### AD-1: Hand-roll the `Sheet` primitive with `cva` (not Radix)
- **Choice**: Add `pwa/src/components/ui/sheet.tsx` as a hand-rolled bottom-sheet using
  `cva` + `cn` + DESIGN tokens, mirroring `pwa/src/components/ui/button.tsx`. No `@radix-ui`.
- **Rationale**: The existing `ui/` inventory (`Button`, `badge`, `card`, `alert`, `skeleton`)
  is hand-rolled with `class-variance-authority` + `cn`; there is **no Radix anywhere** in the
  tree. A hand-rolled sheet is the consistent choice and avoids a runtime dependency the repo
  has so far avoided. The sheet's needs here are modest (overlay + bottom panel + dismiss +
  reduced-motion), well within a small component.
- **Alternatives considered**: Vendor `@radix-ui/react-dialog` (canonical shadcn Sheet — free
  focus-trap/portal/a11y, but a new dep and a vendoring style the repo doesn't use). Rejected
  for consistency + dep-surface; we replicate the needed a11y by hand (focus management,
  `role="dialog"`, `aria-modal`, Escape-to-close, `aria-label`ed actions).

### AD-2: `ShareSheet` owns the two actions and their transient state
- **Choice**: `pwa/src/components/ShareSheet.tsx` composes `Sheet` + two `Button`s and owns the
  `open, copying, copied, saving, saved, error` state model (DESIGN §3). It receives the article
  (or just `linkedin: string` + `imageUrl: string`) as props — no Firestore access of its own.
- **Rationale**: Keeps the data boundary at the route/`ArticleView` level (F-009 already reads
  the `Article`); the share UI is a pure presentational + browser-API component, trivially
  testable with mocked `navigator.*`.
- **Alternatives considered**: Put clipboard/share logic directly in `ArticleView`. Rejected —
  bloats the reader and muddies the test seam.

### AD-3: Extract browser side-effects into a tested `lib/share.ts`
- **Choice**: Two pure-ish helpers in `pwa/src/lib/share.ts`: `copyText(text)` (wraps
  `navigator.clipboard.writeText`) and `saveImage(url, filename)` (fetch→blob→`navigator.share`
  with `File`, falling back to `<a download>`). Each returns a discriminated result the
  component maps to toasts.
- **Rationale**: Isolates the only hard-to-test surface (browser APIs) behind a thin, unit-
  testable boundary — matches the repo's `lib/` pattern (`format.ts`, `hero.ts`, `useOnline.ts`).
- **Alternatives considered**: Inline the API calls in the component. Rejected — harder to mock,
  couples UI to capability detection.

### AD-4: `lucide-react` for the two action icons
- **Choice**: Add `lucide-react`; use `Copy` and `Download` (or `Share`) glyphs in the buttons.
- **Rationale**: User-selected. Standard shadcn icon set; `Button` already reserves an icon slot
  (`gap-sm`). One dependency, reviewed in the PR per CLAUDE.md.
- **Alternatives considered**: Inline SVG / text-only (zero deps) — not chosen.

### AD-5: iOS-first save path with capability detection, not UA sniffing
- **Choice**: Prefer `navigator.canShare?.({ files: [file] })` + `navigator.share(...)`; fall
  back to a programmatic `<a download>` click when file-share is unsupported. On the
  `<a download>` branch fire `Toast.success` "Image enregistrée"; on the native-share branch the
  OS sheet replaces the toast (DESIGN §interactions, line 230). A user-cancelled share is a no-op.
- **Rationale**: Feature-detection is robust across iOS Safari versions and desktop; avoids
  brittle UA checks (constitution-friendly, testable by stubbing `navigator`).

## Affected Files

### New Files
| File | Purpose |
|---|---|
| `pwa/src/components/ui/sheet.tsx` | Hand-rolled bottom-sheet primitive (overlay + panel, dismiss, reduced-motion, `role="dialog"`/`aria-modal`). |
| `pwa/src/components/ShareSheet.tsx` | The two-action share UI (DESIGN §3 `ShareSheet`); owns transient state, maps results to toasts. |
| `pwa/src/lib/share.ts` | `copyText` + `saveImage` browser-API helpers returning discriminated results. |
| `pwa/src/lib/share.test.ts` | Unit tests for clipboard success/failure and share/`<a download>` branches (mocked `navigator`). |
| `pwa/src/components/ShareSheet.test.tsx` | Component tests: open, copy→toast, save branch, error keeps sheet open, reduced-motion. |

### Modified Files
| File | Change |
|---|---|
| `pwa/src/components/ArticleView.tsx` | Replace the empty `share-footer-slot` footer with a "Partager" `Button` that opens `ShareSheet` (keep the `data-testid` so the F-009 test still passes). |
| `pwa/package.json` | Add `lucide-react` dependency. |
| `pnpm-lock.yaml` | Lockfile update for the new dep (committed; reviewed in PR per CLAUDE.md). |

## Implementation Phases

### Phase 1: Primitives & helpers (foundation)
- Add `lucide-react`; `pnpm install`; commit lockfile.
- `ui/sheet.tsx`: `cva`-driven overlay + bottom panel using `shadow.lg`, `radius.xl` top edge,
  `motion.duration.base` / `easing.standard` slide-in, all gated by `prefers-reduced-motion`.
  Props: `open`, `onOpenChange`, `title`, children. Escape + overlay-click dismiss; focus the
  panel on open, restore on close.
- `lib/share.ts`: `copyText` and `saveImage` with capability detection and discriminated returns.

### Phase 2: ShareSheet component (business logic)
- `ShareSheet.tsx`: compose `Sheet` + two `Button`s ("Copier le post" / "Enregistrer l'image"),
  `lucide` icons, the `open…error` state model, and toast wiring (`toast.success`/`toast.error`
  from `sonner`, already mounted in `AppShell`). Disable an action if its payload is absent (AD per spec).
- Strings in French (`fr` locale, DESIGN §locale).

### Phase 3: Wire into ArticleView + tests
- `ArticleView.tsx`: render a "Partager" trigger `Button` in the existing footer; open `ShareSheet`
  with `article.linkedin` and `heroUrl(article.image)`. Preserve `data-testid="share-footer-slot"`.
- Unit tests (`lib/share.test.ts`) + component tests (`ShareSheet.test.tsx`); extend/keep the
  existing `ArticleView` assertion. Run `pnpm lint`, `pnpm typecheck`, `pnpm --filter @veilleur/pwa run build`, `pnpm --filter @veilleur/pwa test`.

## Design Mobilization
- **Tokens used**: `shadow.lg` (sheet), `radius.xl` (sheet top edge), `radius.md` (buttons),
  `space.md`/`space.lg`/`space.2xl` (footer + sheet padding), `motion.duration.base`,
  `motion.easing.standard`, `color.primary`/`bg-elevated`/`border-strong` (button variants),
  `text.caption` (button label), `font.body`.
- **Components used**: `ShareSheet` (DESIGN §3 — **built this track**), `Sheet` (**new primitive,
  this track** — additive vendor, no token change, no `/design update` needed), `Button`
  (existing), `Toast`/`Sonner` (existing, mounted in `AppShell`).
- **Surfaces touched**: `ArticleView` share footer (DESIGN §3, line 162).
- **States covered**: success (copied / saved toasts), error (failed copy keeps sheet open;
  failed image fetch toast). Loading = transient `copying`/`saving`. Empty/offline N/A (article
  already loaded by the route; share acts on in-memory data).
- **A11y notes**: `role="dialog"` + `aria-modal` + `aria-label` on the sheet; `aria-label` on
  icon-bearing action buttons; 44×44pt targets (inherited from `Button`); Escape-to-close; focus
  trapped/restored; `prefers-reduced-motion` disables sheet slide-in (DESIGN §a11y, line 245).

## Test Strategy
- **Mocking approach**: Vitest + `@testing-library/react` + `userEvent` (repo pattern, see
  `components.test.tsx`). Stub `navigator.clipboard.writeText`, `navigator.share`,
  `navigator.canShare`, and `global.fetch` (blob) with `vi.fn()`; assert toast text via the
  mounted `Toaster` or by spying on `sonner`'s `toast`.
- **Happy paths**: copy writes `article.linkedin` and shows "Post copié"; save calls
  `navigator.share` with a `File` when `canShare` is true; `<a download>` path shows
  "Image enregistrée".
- **Error scenarios**: `writeText` rejects → `toast.error`, sheet stays open; `fetch` rejects →
  `toast.error`, copy still works; `navigator.share` rejects with `AbortError` (cancel) → no toast.
- **Edge cases**: `navigator.share`/`canShare` undefined → fallback path taken; missing
  `linkedin`/`image` → action disabled; reduced-motion → no slide-in class applied.

## Risk & Complexity
- **Estimated complexity**: Low. Single PWA surface, no backend, no Firestore changes, no schema
  changes; the data seam and toaster already exist.
- **Key risks**:
  - iOS Web Share-with-files behaviour varies by version; mitigated by capability detection +
    `<a download>` fallback (AD-5). True on-device verification is AC-7 (manual, like F-009 AC-9).
  - jsdom lacks `navigator.share`/`clipboard`/Web Share — all stubbed in tests; no real-browser
    assertion in CI (documented, not silently skipped).
  - Hand-rolled focus-trap is the fiddliest part; keep it minimal (focus panel, Escape, restore).
- **New dependencies**: `lucide-react` (icons). No Radix. Lockfile committed + reviewed in PR.
