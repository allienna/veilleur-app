# Tasks: Monorepo scaffold + shared types + CLAUDE.md

**Plan**: specs/002-monorepo-scaffold/plan.md
**Status**: Complete
**Total**: 21 tasks across 6 phases

> Conventions: no root `CLAUDE.md` exists yet (it is a deliverable — T-6.1). Mirror the existing `minion/` setup: ruff line-length 100, py312, strict pyright, lockfiles committed (constitution §6). TS is `strict: true`, no `any`, ESLint + Prettier (constitution §4). Pin every tool version so codegen is deterministic. **Never touch `minion/src/minion/spike/`, `infra/spike/`, or the spike scripts** (AC-8).

## Phase 1: Workspace tooling foundation

- [x] **T-1.1**: Root pnpm workspace + scripts
  - **Do**: Create root `package.json` (private, `packageManager` pinning pnpm, scripts `lint`/`typecheck`/`build` that fan out via `pnpm -r`) and `pnpm-workspace.yaml` declaring members `pwa`, `trigger-api`, `shared`. Add a `.npmrc` if needed for deterministic installs.
  - **Test**: `pnpm install` succeeds and creates `pnpm-lock.yaml`; `pnpm -r exec true` lists the three packages once they exist.

- [x] **T-1.2**: Confirm minion tooling runs from a clean checkout
  - **Do**: No new config — verify the existing `minion/pyproject.toml` ruff/pyright setup works standalone. Add a `dev` dependency on `pytest` to `minion/pyproject.toml` if absent (needed by the `build-minion` workflow) and resync.
  - **Test**: `cd minion && uv sync && uv run ruff check . && uv run ruff format --check . && uv run pyright` all exit 0 (incl. the F-001 `spike/` package).

- [x] **T-1.3**: Confirm/extend `.gitignore` for the new workspaces
  - **Do**: Verify `.gitignore` ignores `node_modules/`, `dist/`, `build/` (it does) and does **not** ignore `shared/generated/` (output is committed) nor lockfiles. Add pnpm store / TS build-info paths only if they leak.
  - **Test**: After scaffolding, `git status --porcelain` shows no stray build artifacts and shows `pnpm-lock.yaml` + `shared/generated/` as tracked.

## Phase 2: shared/ — schema source of truth + codegen

- [x] **T-2.1**: `shared/` package + JSON Schema sources
  - **Do**: Create `shared/package.json` (workspace member) and `shared/schema/run-status.json` (enum: `success`, `success_with_warnings`, `failure`, `skipped`, `aborted`, `running`) + `shared/schema/run.json` (minimal `Run` + `RunStep` shape referencing the status enum). Add `$id`/`title` so generators name types stably.
  - **Test**: `pnpm --filter shared exec node -e "JSON.parse(require('fs').readFileSync('schema/run.json'))"` parses; schemas validate as draft-2020-12.

- [x] **T-2.2**: TS codegen (`json-schema-to-typescript`)
  - **Do**: Add pinned `json-schema-to-typescript` dev dep to `shared/`; add `gen:ts` script writing to `shared/generated/ts/`. Commit generated output.
  - **Test**: `pnpm --filter shared run gen:ts` produces `shared/generated/ts/*.ts`; re-running yields an empty `git diff` (deterministic).

- [x] **T-2.3**: Python codegen (`datamodel-code-generator` → Pydantic v2)
  - **Do**: Add a `shared/` codegen path for Python via pinned `datamodel-code-generator` (invoked through `uvx`/`uv run` with a pinned version, driven by a `shared` script `gen:py`) writing Pydantic v2 models to `shared/generated/python/`. Commit output.
  - **Test**: `pnpm --filter shared run gen:py` produces `shared/generated/python/*.py`; re-run yields empty `git diff`; `python -c "import ast; ast.parse(open(<file>).read())"` parses.

- [x] **T-2.4**: Combined `gen` + `check` scripts
  - **Do**: Add `shared` scripts `gen` (runs `gen:ts` + `gen:py`) and `check` (runs `gen` then `git diff --exit-code -- shared/generated`). Document the single command in plan/CLAUDE later.
  - **Test**: `pnpm --filter shared run check` exits 0 on a clean tree; mutate a schema without regenerating → `check` exits non-zero.

## Phase 3: pwa/ skeleton

- [x] **T-3.1**: PWA Vite + React 18 + TS skeleton
  - **Do**: Create `pwa/package.json`, `pwa/tsconfig.json` (`strict: true`), `pwa/vite.config.ts`, `pwa/index.html`, `pwa/src/main.tsx` + minimal `App.tsx` placeholder. No feature components (those are F-009). Wire to consume `shared/generated/ts` via workspace dependency.
  - **Test**: `pnpm --filter pwa run build` succeeds; `pnpm --filter pwa exec tsc --noEmit` exits 0.

- [x] **T-3.2**: PWA ESLint + Prettier
  - **Do**: Add ESLint (TS, no `any`, no `@ts-ignore`) + Prettier config to `pwa/`; add `lint` script.
  - **Test**: `pnpm --filter pwa run lint` exits 0 on the placeholder app.

- [x] **T-3.3**: PWA allowed-email constant (location 3 of 3)
  - **Do**: Create `pwa/src/config.ts` exporting the allowed email `aurelien.allienne@gmail.com` as a typed const, in a format the grep test can extract (T-5.1 defines the shared extraction pattern).
  - **Test**: `pnpm --filter pwa exec tsc --noEmit` still passes; the literal string is present.

## Phase 4: trigger-api/ skeleton (TypeScript)

- [x] **T-4.1**: trigger-api TS service skeleton
  - **Do**: Create `trigger-api/package.json`, `trigger-api/tsconfig.json` (`strict: true`), `trigger-api/src/index.ts` with an empty `POST /trigger` handler stub (returns 501/not-implemented). Consume `shared/generated/ts`. No JWT logic (F-008).
  - **Test**: `pnpm --filter trigger-api exec tsc --noEmit` exits 0; `pnpm --filter trigger-api run build` succeeds.

- [x] **T-4.2**: trigger-api ESLint + Prettier
  - **Do**: Add ESLint + Prettier config + `lint` script to `trigger-api/`.
  - **Test**: `pnpm --filter trigger-api run lint` exits 0.

- [x] **T-4.3**: trigger-api allowed-email constant (location 2 of 3)
  - **Do**: Create `trigger-api/src/auth.ts` exporting the allowed email `aurelien.allienne@gmail.com` in the grep-extractable format. Stub the assertion site as a TODO referencing F-008.
  - **Test**: `pnpm --filter trigger-api exec tsc --noEmit` passes; literal present.

## Phase 5: Allowed-email invariant + Firestore rules

- [x] **T-5.1**: `firestore.rules` with pinned email (location 1 of 3)
  - **Do**: Create top-level `firestore.rules` declaring the allowed email `aurelien.allienne@gmail.com` (a `function isAllowed()` / constant referencing `request.auth.token.email`). Full rules logic deferred to F-009 — just the pinned constant + a deny-by-default skeleton.
  - **Test**: File exists; the email literal is present in the same extractable format as the other two.

- [x] **T-5.2**: `scripts/check-allowed-email.sh` grep test
  - **Do**: Write a script that extracts the email value from `firestore.rules`, `trigger-api/src/auth.ts`, `pwa/src/config.ts` and exits non-zero (printing all three paths + values) if they are not byte-identical. Make executable.
  - **Test**: `scripts/check-allowed-email.sh` exits 0 with all three matching; temporarily edit one value → exits non-zero naming the mismatch; revert.

## Phase 6: CI workflows + CLAUDE.md

- [x] **T-6.1**: Root `CLAUDE.md`
  - **Do**: Create root `CLAUDE.md` documenting per workspace (`pwa`, `minion`, `trigger-api`, `shared`): install/build/lint/format/typecheck/test commands; the codegen command (`pnpm --filter shared run gen`); the allowed-email invariant + its three locations + the check script; pointers to PRD/constitution/roadmap/DESIGN.
  - **Test**: Every command quoted in `CLAUDE.md` is run once and exits 0 (AC-5).

- [x] **T-6.2**: `.github/workflows/build-minion.yml`
  - **Do**: Workflow stub: setup uv + Python 3.12, `uv sync`, `ruff check`, `ruff format --check`, `pyright`, `pytest` for `minion/`.
  - **Test**: `actionlint .github/workflows/build-minion.yml` (or YAML parse) passes; steps mirror the AC-2 commands.

- [x] **T-6.3**: `.github/workflows/deploy-pwa.yml`
  - **Do**: Workflow stub: setup pnpm + Node, `pnpm install`, `pnpm --filter pwa lint`/`typecheck`/`build`. Deploy step present but guarded (e.g. `if: false` / env gate) so it no-ops until F-007.
  - **Test**: YAML parses / `actionlint` passes; deploy step is demonstrably guarded.

- [x] **T-6.4**: `.github/workflows/validate-specs.yml`
  - **Do**: Workflow stub running `scripts/check-allowed-email.sh` and `pnpm --filter shared run check` (codegen-sync diff).
  - **Test**: YAML parses / `actionlint` passes; both checks invoked.

- [x] **T-6.5**: `infra/` top-level placeholder
  - **Do**: Add `infra/README.md` describing where non-spike IaC will live (F-007), without touching `infra/spike/`.
  - **Test**: `infra/spike/` is byte-unchanged (`git status` shows only the new `infra/README.md`).

- [x] **T-6.6**: Full clean-checkout green gate (acceptance sweep)
  - **Do**: From a fresh state, run the complete AC matrix: AC-1 (TS workspaces), AC-2 (minion), AC-3 (codegen sync), AC-4 (email grep incl. negative case), AC-5 (CLAUDE.md commands), AC-6 (workflows valid), AC-7 (lockfiles committed), AC-8 (spike untouched, no secrets).
  - **Test**: All eight acceptance criteria pass; record results for `/review`.
