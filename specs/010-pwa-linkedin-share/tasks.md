# Tasks: PWA LinkedIn Share (two-tap)

**Plan**: specs/010-pwa-linkedin-share/plan.md
**Status**: Ready
**Total**: 9 tasks across 3 phases

> Test commands (from CLAUDE.md): run from repo root —
> `pnpm --filter @veilleur/pwa test` (vitest), `pnpm lint`, `pnpm typecheck`,
> `pnpm --filter @veilleur/pwa run build`. Single test file:
> `pnpm --filter @veilleur/pwa exec vitest run src/<path>.test.ts`.

## Phase 1: Primitives & helpers

- [x] **T-1.1**: Add `lucide-react` dependency
  - **Do**: From `pwa/`, `pnpm add lucide-react`. Commit the updated `pwa/package.json` and
    root `pnpm-lock.yaml`. No code yet — dependency only (new-dep note for the PR per CLAUDE.md).
  - **Test**: `pnpm install` clean; `pnpm --filter @veilleur/pwa exec node -e "require.resolve('lucide-react')"` resolves; `pnpm typecheck` still green.

- [x] **T-1.2**: Hand-roll the `Sheet` primitive (`pwa/src/components/ui/sheet.tsx`)
  - **Do**: Create a `cva`-driven bottom-sheet mirroring `ui/button.tsx` conventions (`cn`,
    DESIGN tokens). Props: `open: boolean`, `onOpenChange: (open: boolean) => void`,
    `title: string`, `children`. Render an overlay + bottom panel using `shadow.lg`,
    `radius.xl` top edge, `motion.duration.base`/`easing.standard` slide-in; gate the slide-in
    on `prefers-reduced-motion: reduce` (static present). `role="dialog"`, `aria-modal="true"`,
    `aria-label={title}`. Dismiss on overlay click and Escape; focus the panel on open and
    restore focus to the opener on close. No `any`, no `@ts-ignore`.
  - **Test**: `pnpm typecheck` + `pnpm lint` green. (Behavioural assertions land via ShareSheet tests in T-3.2/T-3.3.)

- [x] **T-1.3**: Browser-API helpers (`pwa/src/lib/share.ts`)
  - **Do**: Export `copyText(text: string): Promise<ShareResult>` wrapping
    `navigator.clipboard.writeText`, and `saveImage(url: string, filename: string): Promise<ShareResult>`
    that fetches the URL → `Blob` → `File`, prefers `navigator.canShare?.({ files }) && navigator.share(...)`,
    and falls back to a programmatic `<a download>` click. Return a discriminated result, e.g.
    `{ ok: true; via: "share" | "download" } | { ok: false; reason: "cancelled" | "error" }`
    (treat `AbortError` from `share` as `cancelled`). Capability detection only — no UA sniffing.
  - **Test**: covered by `pnpm --filter @veilleur/pwa exec vitest run src/lib/share.test.ts` (T-1.4).

- [x] **T-1.4**: Unit tests for `lib/share.ts` (`pwa/src/lib/share.test.ts`)
  - **Do**: With Vitest, stub `navigator.clipboard.writeText`, `navigator.share`,
    `navigator.canShare`, and `global.fetch`. Assert: copy success returns `{ok:true}` and calls
    `writeText` with the text; copy rejection returns `{ok:false, reason:"error"}`; save with
    `canShare` true calls `navigator.share` with a `File` (`via:"share"`); save with share
    unavailable takes the `<a download>` path (`via:"download"`); `fetch` rejection →
    `{ok:false, reason:"error"}`; `share` `AbortError` → `{ok:false, reason:"cancelled"}`.
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/lib/share.test.ts` passes.

## Phase 2: ShareSheet component

- [x] **T-2.1**: `ShareSheet` component (`pwa/src/components/ShareSheet.tsx`)
  - **Do**: Props `{ open, onOpenChange, linkedin: string, imageUrl: string, imageFilename: string }`.
    Compose `Sheet` + two `Button`s: "Copier le post" (`Copy` icon) and "Enregistrer l'image"
    (`Download` icon). Own the `copying/copied/saving/saved/error` transient state. On copy call
    `copyText`; on save call `saveImage`. Map results to `sonner` toasts: success copy →
    `toast.success("Post copié")` (2s); `<a download>` save → `toast.success("Image enregistrée")`
    (2s); native-share save → no toast (OS sheet replaces it, DESIGN line 230); copy error →
    `toast.error(...)` and keep the sheet open; image-fetch error → `toast.error("Image indisponible")`.
    Disable an action when its payload is empty. French strings. `aria-label` on icon buttons.
  - **Test**: covered by `src/components/ShareSheet.test.tsx` (T-3.2/T-3.3); `pnpm typecheck`/`pnpm lint` green now.

## Phase 3: Wiring & tests

- [x] **T-3.1**: Wire `ShareSheet` into `ArticleView` footer (`pwa/src/components/ArticleView.tsx`)
  - **Do**: In the existing `<footer data-testid="share-footer-slot">`, render an always-visible
    "Partager" `Button`; manage an `open` state and render `<ShareSheet open … linkedin={article.linkedin}
    imageUrl={heroUrl(article.image)} imageFilename={article.image} />`. Keep the `data-testid`
    on the footer so the F-009 `ArticleView` test still passes. No reader layout regression.
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/components/components.test.tsx` (existing ArticleView test) still passes.

- [x] **T-3.2**: Component tests — happy paths (`pwa/src/components/ShareSheet.test.tsx`)
  - **Do**: Render `ArticleView` (or `ShareSheet` directly) with a `Toaster` mounted; stub
    `navigator.*`/`fetch`. Assert: tapping "Partager" opens the sheet with both actions;
    "Copier le post" writes `article.linkedin` and shows "Post copié"; save with `canShare`
    true calls `navigator.share`; the `<a download>` branch shows "Image enregistrée".
    (Covers AC-1, AC-2, AC-3.)
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/components/ShareSheet.test.tsx` passes.

- [x] **T-3.3**: Component tests — errors, reduced-motion, a11y (same file)
  - **Do**: Assert: clipboard rejection → `toast.error` and the sheet stays open (AC-4);
    image-fetch rejection → `toast.error` and copy still works (AC-5); a `prefers-reduced-motion`
    match disables the slide-in class (AC-6); sheet exposes `role="dialog"` + `aria-modal` and
    Escape closes it. Stub `window.matchMedia` for the reduced-motion case.
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/components/ShareSheet.test.tsx` passes.

- [x] **T-3.4**: Full gate — lint, typecheck, build, tests
  - **Do**: Resolve anything flagged across the workspace. Confirm no `any`/`@ts-ignore` were
    introduced (AC-9). Confirm the new-dependency note is in the eventual PR description (CLAUDE.md).
  - **Test**: `pnpm lint` && `pnpm typecheck` && `pnpm --filter @veilleur/pwa run build` && `pnpm --filter @veilleur/pwa test` all pass. (AC-8.)

> **AC-7** (≤30s open→copy→save on iOS Safari) is manual on-device verification — it cannot run
> in jsdom/CI. Track it like F-009 AC-9 (device check), not as an automated task.
