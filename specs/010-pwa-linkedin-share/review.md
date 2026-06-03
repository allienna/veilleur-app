# Review: PWA LinkedIn Share (two-tap)

**Track**: 010-pwa-linkedin-share
**Reviewed**: 2026-06-03
**Spec**: specs/010-pwa-linkedin-share/spec.md
**Plan**: specs/010-pwa-linkedin-share/plan.md
**Verdict**: **Pass with notes** (AC-7 deferred to on-device verification)

## 1. Task completion
All 9 tasks across 3 phases are checked in tasks.md. Implemented surface:
- `pwa/src/components/ui/sheet.tsx` — hand-rolled bottom sheet (new primitive).
- `pwa/src/components/ShareSheet.tsx` — two-action share UI.
- `pwa/src/lib/share.ts` (+ `share.test.ts`) — clipboard / Web-Share / `<a download>` helpers.
- `pwa/src/components/ShareSheet.test.tsx` — component tests.
- `pwa/src/components/ArticleView.tsx` — footer "Partager" trigger wired (slot `data-testid` preserved).
- `pwa/package.json` + `pnpm-lock.yaml` — `lucide-react` added.

## 2. Quality gates
| Gate | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | ✅ pass (all 3 TS workspaces) |
| Types | `pnpm typecheck` | ✅ pass |
| Build | `pnpm --filter @veilleur/pwa run build` | ✅ built (see Note 1) |
| Tests | `pnpm --filter @veilleur/pwa test` | ✅ 37/37 (was 28; +9 new) |
| TS hygiene | grep `any` / `@ts-ignore` in new files | ✅ none |

## 3. Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 footer opens ShareSheet w/ two actions | ✅ | `ShareSheet.test.tsx` "open flow via ArticleView" |
| AC-2 copy → clipboard + "Post copié", no dialog | ✅ | "copies the LinkedIn post and confirms" |
| AC-3 save → Web Share `File`, else `<a download>` | ✅ | "uses the Web Share API…" + "falls back to `<a download>`" |
| AC-4 failed copy → error toast, sheet stays open | ✅ | "on copy failure shows an error toast and leaves the sheet open" |
| AC-5 failed image fetch → toast, copy unaffected | ✅ | "on image fetch failure shows an error toast; copy still works" |
| AC-6 reduced-motion disables slide-in | ✅ | "omits the slide-in transition…" + default counter-test |
| AC-7 ≤30s open→copy→save on iOS Safari | ⏸ deferred | Manual, on-device; cannot run in jsdom/CI (mirrors F-009 AC-9). |
| AC-8 lint/typecheck/build/test pass | ✅ | §2 |
| AC-9 no `any` / `@ts-ignore` | ✅ | §2 |

## 4. Spec conformance notes
- **Two-tap, no auto-post** (PRD §C, Out-of-Scope): no LinkedIn API; manual copy/paste flow only. ✅
- **iOS interaction model** (DESIGN line 230): native share path emits **no** toast (OS sheet
  replaces it); only the `<a download>` fallback toasts "Image enregistrée". Implemented + tested. ✅
- **Capability detection, not UA sniffing** (plan AD-5): `navigator.canShare({files})` gates the
  share path. ✅
- **A11y** (DESIGN §5): `role="dialog"` + `aria-modal`, `aria-label`, Escape + overlay dismiss,
  focus captured on open / restored on close, 44×44 targets (inherited from `Button`),
  reduced-motion honored. ✅
- **No Radix** (plan AD-1): sheet hand-rolled with `cva`/`cn`, consistent with the existing
  `ui/` inventory. ✅

## Notes / follow-ups
1. **Bundle warning (pre-existing, not introduced)**: the build warns that the main chunk
   >500 kB. This is dominated by `firebase` and predates this track; `lucide-react` is
   tree-shaken (4 icons). No action required for F-010; code-splitting is an F-013 concern.
2. **AC-7 device check**: verify the ≤30s open→copy→save flow on a real iPhone (Safari /
   installed PWA) during F-009/F-013 device passes. The Web Share-with-files path only truly
   exercises on-device — jsdom stubs it.
3. **New dependency**: `lucide-react@1.17.0` — call out in the PR description per CLAUDE.md.
