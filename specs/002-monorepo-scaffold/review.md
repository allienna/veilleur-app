# Review: Monorepo scaffold + shared types + CLAUDE.md

**Spec**: specs/002-monorepo-scaffold/spec.md
**Plan**: specs/002-monorepo-scaffold/plan.md
**Reviewed**: 2026-05-26
**Verdict**: **Pass with notes**

## Task completion

21/21 tasks checked across 6 phases. (Header originally said 18; Phase 6 grew to 6 tasks during planning. No scope dropped.)

## Quality gates

| Gate | Result |
|------|--------|
| `pnpm lint` (pwa, trigger-api) | ✅ pass |
| `pnpm typecheck` (pwa, trigger-api) | ✅ pass |
| `pnpm build` (pwa, trigger-api) | ✅ pass |
| `minion` ruff check / format / pyright | ✅ pass |
| `minion` pytest | ✅ 1 passed (smoke) |
| `pnpm check:codegen` (regen + diff) | ✅ deterministic, empty diff |
| `pnpm check:email` (3-location grep) | ✅ pass; verified negative case fails with exit 1 |
| Workflow YAML valid | ✅ all 3 parse |
| Frozen lockfiles | ✅ `pnpm --frozen-lockfile` + `uv sync --locked` clean |
| Secrets scan | ✅ only doc placeholders in untouched spike files |

## Acceptance criteria

- **AC-1** ✅ Clean-checkout `pnpm install` + lint + typecheck for the three TS workspaces.
- **AC-2** ✅ (amended) minion ruff + format + pyright + pytest green. The throwaway F-001 `spike/` is excluded from pyright (pre-existing strict-mode errors on `main`; user-approved during /build) but still covered by ruff. Spec AC-2 updated to reflect this.
- **AC-3** ✅ JSON Schema → committed TS + Pydantic; regen produces an empty diff (deterministic; tool versions pinned).
- **AC-4** ✅ Email byte-identical across `firestore.rules`, `trigger-api/src/auth.ts`, `pwa/src/config.ts`; grep test passes on match, fails on desync.
- **AC-5** ✅ Every command quoted in `CLAUDE.md` was executed and exited 0.
- **AC-6** ✅ `build-minion`, `deploy-pwa`, `validate-specs` present, valid, runnable; deploy job guarded with `if: false` until F-007.
- **AC-7** ✅ `pnpm-lock.yaml` + `minion/uv.lock` committed and frozen-clean.
- **AC-8** ✅ Spike dirs/scripts untouched (`git status` clean for `minion/src/minion/spike`, `infra/spike`, spike scripts); no real secrets committed.

## Spec conformance notes

- **Decisions resolved as planned**: trigger-api = TypeScript (OQ-3); email literal-committed (OQ-1); codegen = `json-schema-to-typescript` + `datamodel-code-generator` (OQ-2); initial schema = status enum + Run/RunStep (OQ-4).
- **Constitution fix-up flagged** (plan AD-3): §5's `ruff/pyright … trigger-api/` line conflicts with the now-TS trigger-api; recommend amending to `pnpm lint`/`typecheck`. **Not done in this track** — belongs in a constitution edit, called out in the PR.

## Notes / follow-ups (non-blocking)

1. **`shared/` package `exports` point at `.ts` source.** Fine under the PWA's `bundler` resolution and unused so far, but `trigger-api` (NodeNext) importing `@veilleur/shared/*` at runtime will need the generated output compiled/emitted (or path import of `generated/python` for Python). Wire the real consumption in F-003/F-008/F-009; revisit whether `shared` should emit JS/`.d.ts`.
2. **`pytest` smoke test is a placeholder** — real deterministic-node tests arrive with F-003+.
3. **Constitution §5 amendment** (above) should land before F-008 implements `trigger-api`.

No blocking issues. Ready to proceed to QA + ship.
