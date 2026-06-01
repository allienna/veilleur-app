# Plan: Monorepo scaffold + shared types + CLAUDE.md

**Spec**: specs/002-monorepo-scaffold/spec.md

## Resolved Open Questions

- **OQ-1** → Pin the allowed-operator email as a **literal committed string** in all three enforcement files. The canonical address is **`aurelien.allienne@gmail.com`** (the personal gmail that owns the `veilleur-app` GCP project — already present in `minion/README.md`, `scripts/spike-cloud.sh`, `scripts/add-secret-versions.sh`; *not* the SFEIR work account).
- **OQ-2** → Codegen toolchain: **`json-schema-to-typescript`** (TS) + **`datamodel-code-generator`** (Pydantic v2). Both consume plain JSON Schema; output is committed and CI-diff-checked.
- **OQ-3** → `trigger-api/` is **TypeScript**. The constitution §5 line `ruff … pyright … trigger-api/` conflicts with the `trigger-api/src/auth.ts` path pinned by the same document's email invariant — flagged as a constitution fix-up (AD-3).
- **OQ-4** → Initial `shared/` schema = the **six run-status tokens** (`success`, `success_with_warnings`, `failure`, `skipped`, `aborted`, `running` — DESIGN §1 / PRD §6) plus a **minimal `Run` + `RunStep` shape**. Enough to prove codegen round-trips both ways; the full model lands in F-003.

## Architecture Decisions

### AD-1: pnpm workspace covers the TS packages; minion stays standalone uv/Python
- **Choice**: Root `pnpm-workspace.yaml` with members `pwa`, `trigger-api`, `shared`. `minion/` is **not** a pnpm member — it keeps its existing standalone `uv` + `pyproject.toml`. Root `package.json` holds workspace scripts (`lint`, `typecheck`, `build`) that fan out to the TS members.
- **Rationale**: `minion/` already has working `uv.lock`, ruff, and strict-pyright config (scoped per-package). Mixing Python into the pnpm graph buys nothing. Two clean toolchains (pnpm for TS, uv for Python) is simpler than one leaky one.
- **Alternatives considered**: Nx/Turborepo (overkill for a skeleton); a single root `pyproject` covering both Python packages (unnecessary now that trigger-api is TS).

### AD-2: shared/ — JSON Schema is the source of truth, codegen output is committed and CI-verified
- **Choice**: `shared/schema/*.json` are authoritative. A `shared/` package script runs `json-schema-to-typescript` → `shared/generated/ts/` and `datamodel-code-generator` → `shared/generated/python/`. Both outputs are committed. The `validate-specs` workflow regenerates and asserts an empty git diff.
- **Rationale**: The cross-language boundary (PWA/trigger-api TS ⟷ minion Pydantic) is exactly where drift causes silent prod bugs. A single schema + a diff gate makes drift a build failure, not a runtime surprise.
- **Alternatives considered**: Hand-synced TS/Python types (constitution §3 lists this as the flexible alternative — rejected: no drift guard); a runtime schema validator only (doesn't give compile-time types).

### AD-3: trigger-api is a TypeScript Cloud Run service skeleton
- **Choice**: `trigger-api/` is a pnpm workspace member (TS, `strict: true`), empty `POST /trigger` handler stub, plus `trigger-api/src/auth.ts` declaring the pinned email constant. Consumes `shared/generated/ts/`. JWT verification logic deferred to F-008.
- **Rationale**: The email invariant pins `auth.ts`; `firebase-admin` JWT verification is first-class in Node; consolidates with the PWA's TS toolchain and generated TS types.
- **Constitution fix-up to note**: §5's `ruff check … trigger-api/` and `pyright … trigger-api/` quality-gate lines no longer apply (trigger-api has no Python). Recommend amending §5 to say "`pnpm lint`/`pnpm typecheck` for `pwa/` and `trigger-api/`." Not blocking this track; flagged in the PR description.

### AD-4: allowed-email literal pinned in three files + CI grep test
- **Choice**: `aurelien.allienne@gmail.com` written verbatim into `firestore.rules`, `trigger-api/src/auth.ts`, `pwa/src/config.ts`. A `scripts/check-allowed-email.sh` extracts the value from each file and fails (naming all three paths + values) if they are not byte-identical. Wired into `validate-specs`.
- **Rationale**: Constitution §2.1 + §5 require an un-driftable single identity. A grep test is the cheapest mechanism that makes the invariant physically enforced in CI.
- **Alternatives considered**: Build-time injection / placeholder (user chose literal-committed; simpler grep, address acceptably public).

### AD-5: CI workflows are runnable stubs invoking checks that exist today
- **Choice**: `build-minion` (uv sync → ruff check → ruff format --check → pyright → pytest), `deploy-pwa` (pnpm install → lint → typecheck → build; deploy step present but guarded behind a condition so it no-ops), `validate-specs` (allowed-email grep + schema-codegen-sync diff). Real deploy targets land in F-007.
- **Rationale**: Later tracks deepen workflows rather than invent them; stubs that actually run the current checks keep `main` green from day one.

### AD-6: Python tooling stays per-package; ruff/pyright config reused as-is
- **Choice**: Keep `minion/pyproject.toml`'s existing ruff (line-length 100, py312) + strict-pyright config untouched. `shared/`'s generated Python is excluded from minion's strict pyright (generated code) or linted with a relaxed per-file-ignore. No root Python config introduced.
- **Rationale**: Don't disturb F-001's working, reviewed setup. Generated Pydantic models shouldn't be held to hand-written strictness.

## Affected Files

### New Files
| File | Purpose |
|------|---------|
| `pnpm-workspace.yaml` | Declares `pwa`, `trigger-api`, `shared` workspace members |
| `package.json` (root) | Workspace scripts: `lint`, `typecheck`, `build`; pins pnpm |
| `pnpm-lock.yaml` | Committed lockfile (constitution §6) |
| `CLAUDE.md` (root) | Per-workspace build/lint/test/codegen commands, email invariant, doc pointers |
| `pwa/package.json`, `pwa/tsconfig.json`, `pwa/vite.config.ts`, `pwa/.eslintrc*` | React 18 + TS + Vite skeleton (no feature components) |
| `pwa/src/config.ts` | Pinned allowed-email constant (location 3 of 3) |
| `pwa/src/main.tsx`, `pwa/index.html` | Minimal placeholder app so `tsc`/`build` pass |
| `trigger-api/package.json`, `trigger-api/tsconfig.json`, `trigger-api/.eslintrc*` | TS Cloud Run service skeleton |
| `trigger-api/src/index.ts` | Empty `POST /trigger` handler stub |
| `trigger-api/src/auth.ts` | Pinned allowed-email constant (location 2 of 3) |
| `shared/package.json` | Codegen scripts (`gen:ts`, `gen:py`, `gen`, `check`) |
| `shared/schema/run-status.json`, `shared/schema/run.json` | JSON Schema source of truth (status enum + Run/RunStep) |
| `shared/generated/ts/*.ts` | Generated TS types (committed) |
| `shared/generated/python/*.py` | Generated Pydantic models (committed) |
| `firestore.rules` | Firestore Security Rules declaring pinned email (location 1 of 3); full rules in F-009 |
| `scripts/check-allowed-email.sh` | CI grep test for the three-location invariant |
| `.github/workflows/build-minion.yml` | Minion CI stub |
| `.github/workflows/deploy-pwa.yml` | PWA CI stub (deploy guarded) |
| `.github/workflows/validate-specs.yml` | Email-grep + codegen-sync checks |

### Modified Files
| File | Change |
|------|--------|
| `specs/roadmap.md` | F-002 status → In Progress (the spec/plan/tasks flow updates it incrementally; the PR's net diff is `Not started` → `In Progress`) |
| `.gitignore` | Add `shared/generated/`? **No** — generated output is committed (AD-2); confirm `.gitignore` already allows lockfiles (it does). Possibly add pnpm store path only if needed. |
| `infra/` | Add a top-level placeholder (e.g. `infra/README.md`) for non-spike IaC; **do not touch `infra/spike/`** |

## Test Strategy

- **Mocking approach**: This is scaffolding — "tests" are mostly executable gate checks, not unit tests. No external API mocking needed.
- **Happy paths**:
  - `pnpm install && pnpm lint && pnpm typecheck` green across `pwa`, `trigger-api`, `shared` (AC-1).
  - `uv sync && ruff check && ruff format --check && pyright` green for `minion/` incl. the F-001 `spike/` package (AC-2).
  - `pnpm --filter shared gen` then `git diff --exit-code shared/generated/` is empty (AC-3).
  - `scripts/check-allowed-email.sh` exits 0 when the three constants match (AC-4).
  - Every command documented in `CLAUDE.md` actually runs (AC-5).
- **Error scenarios**:
  - Desync one email constant → `check-allowed-email.sh` exits non-zero, names all three paths + differing values (AC-4 negative case).
  - Edit a schema without regenerating → `validate-specs` codegen-sync diff is non-empty → fail.
- **Edge cases**: clean-checkout reproducibility (no reliance on pre-existing `node_modules`/`.venv`); generated-code determinism (codegen must produce stable, diff-free output across runs — pin tool versions).

## Risk & Complexity

- **Estimated complexity**: Medium. No business logic, but five workspaces + two toolchains + a reproducible codegen gate is a lot of surface to get green together.
- **Key risks**:
  - **Codegen non-determinism** — `json-schema-to-typescript`/`datamodel-code-generator` output can vary by version/locale; mitigate by pinning exact tool versions and committing output so CI diffs catch drift.
  - **Constitution §5 inconsistency** (ruff/pyright on a now-TS trigger-api) — flagged in AD-3; note in PR, optionally amend constitution.
  - **Disturbing F-001's reviewed setup** — minion's ruff/pyright config and the spike packages must stay untouched (AC-8); integrate around them, don't refactor.
  - **Email in public git history** — accepted by OQ-1 decision; it's already in committed spike scripts, so no new exposure.
- **New dependencies**: pnpm (workspace mgr), TS/Vite/React/ESLint/Prettier for `pwa`; TS toolchain for `trigger-api`; `json-schema-to-typescript` + `datamodel-code-generator` for `shared`. All pinned, lockfiles committed, listed in the PR description per constitution §6.
