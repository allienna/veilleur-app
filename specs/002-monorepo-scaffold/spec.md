# Spec: Monorepo scaffold + shared types + CLAUDE.md

**Track ID**: 002-monorepo-scaffold
**Roadmap ref**: F-002
**Status**: In Progress
**Created**: 2026-05-26
**Branch**: feat/002-monorepo-scaffold
**PRD sections**: §8 Repo layout, §8 Configuration, §4 Scalability (hard caps), constitution §4–§5
**Depends on**: F-001 Hello-Veilleur spike — **Complete** (R1 + R9 closed, merged)

## Context

F-001 proved the IAM + plumbing chain works inside a throwaway `spike/` package. Before any business logic is written (F-003 onward), the repo needs a real skeleton: the five workspaces named in PRD §8, a single source of truth for the data shapes that cross the Python↔TypeScript boundary, the root `CLAUDE.md` that documents how to build/lint/test every workspace, and — most importantly — the **single-allowed-identity invariant** (constitution §2 principle 1) made physically un-driftable via a CI grep test.

Today the only real code is `minion/` (with an F-001 `spike/` subpackage), `infra/spike/`, and `scripts/`. There is no `pwa/`, `trigger-api/`, or `shared/`, no root `CLAUDE.md`, no `.github/workflows/`, and no workspace-level tooling config. This feature lays all of that down as **compilable empty skeletons** — no feature behaviour, just structure that the next eleven tracks build into.

This is also a spec-coding-artefact deliverable: the scaffold is what the DevLille audience sees as "the shape of a well-specced monorepo," so structure and conventions matter as much as function here.

## User Stories

- As the **developer**, I want each workspace (`pwa/`, `minion/`, `trigger-api/`, `shared/`) to build, lint, and type-check from a clean checkout so that every later track starts from green.
- As the **developer**, I want a root `CLAUDE.md` listing the canonical build/lint/test commands per workspace so that Claude Code (and I) never guess how to operate a workspace.
- As the **developer**, I want the shared data shapes defined once (JSON Schema) and code-generated into both TS and Python so that the cross-language boundary can never silently drift.
- As the **security owner**, I want the allowed-operator email pinned in exactly the three enforcement locations with a CI test that fails the build if they ever disagree, so that constitution principle 1 cannot be violated by accident.
- As the **CI maintainer**, I want stub workflows (`build-minion`, `deploy-pwa`, `validate-specs`) wired to run the right checks so that later tracks extend them rather than invent them.

## Functional Requirements

### FR-1: Workspace skeletons
Create the directory layout from PRD §8, each as a compilable empty workspace:
- `pwa/` — React 18 + TS + Vite skeleton (constitution §3 stack). `pnpm` workspace member. `tsc --noEmit` and `eslint` pass on an empty/placeholder app. No feature components yet (those land in F-009).
- `minion/` — **already exists**; integrate it into the workspace tooling (ruff/pyright config, `uv`), do not rebuild it. The F-001 `spike/` subpackage stays as-is.
- `trigger-api/` — TS Cloud Run service skeleton (empty handler stub), `pnpm` workspace member, type-checks clean.
- `shared/` — JSON Schema sources + codegen pipeline (FR-3).
- `infra/` — **already exists** (`infra/spike/`); add a top-level placeholder for non-spike IaC without disturbing the spike.

### FR-2: Root tooling configuration
- `pnpm-workspace.yaml` declaring `pwa`, `trigger-api`, `shared` (and any TS package) as members; root `package.json` with workspace-level scripts (`lint`, `typecheck`, `build`).
- Python tooling: `uv` as package manager (already used by `minion/`), `ruff` (lint + format) and `pyright` configured to cover `minion/` and `trigger-api/` Python (if any). Confirm `ruff check`, `ruff format --check`, `pyright` run from root and pass.
- Lockfiles committed: `uv.lock` (exists), `pnpm-lock.yaml` (new).

### FR-3: Shared types — JSON Schema source of truth with codegen
- JSON Schema files under `shared/schema/` are the single source of truth for cross-boundary shapes (initial set: enough to be demonstrable, e.g. a `Run`/`RunStep` shape and the status enum from DESIGN §1 — exact shapes are a skeleton, full models land in F-003).
- A codegen step produces TypeScript types (consumed by `pwa/` + `trigger-api/`) and Python (Pydantic-compatible) models (consumed by `minion/`).
- Codegen is reproducible via a documented command and its output is committed; a CI/check step verifies generated output is in sync with the schema (regenerate → diff must be empty).

### FR-4: Allowed-email invariant pinned in three locations + CI grep
- The allowed operator email constant is declared in three enforcement locations (constitution §5 / §2.1):
  - `firestore.rules`
  - `trigger-api/src/auth.ts`
  - `pwa/src/config.ts`
- A CI test (the `validate-specs` workflow, or a dedicated check) greps the three locations and **fails the build if the values are not byte-identical**.
- Note: the spec does not commit the real email into git history gratuitously — pick the canonical operator email (the project's allowed identity) and pin it consistently. (Open question OQ-1.)

### FR-5: Root CLAUDE.md
- Create root `CLAUDE.md` documenting, per workspace: how to install deps, build, lint, format, type-check, and test; the allowed-email invariant and where it lives; the codegen command; the constitution/PRD/roadmap pointers. This is the file Claude Code reads on every session — it must be accurate and minimal.

### FR-6: CI workflow stubs
Under `.github/workflows/`, create three workflows as **runnable stubs** (they invoke the real checks that exist now; later tracks deepen them):
- `build-minion` — `ruff check`, `ruff format --check`, `pyright`, `uv` build/test for `minion/`.
- `deploy-pwa` — `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm build` for `pwa/` (deploy step stubbed/guarded, not wired to Firebase yet).
- `validate-specs` — runs the allowed-email grep test (FR-4) and the schema-codegen-sync check (FR-3); optionally validates `specs/` presence.

## Design References

| Surface | Components used | New components needed |
|---------|-----------------|-----------------------|
| (none) | F-002 is repo-wide scaffolding with no user-facing surface. The only DESIGN.md touchpoint is the **status token enum** (DESIGN §1), which is encoded as a JSON Schema enum in `shared/` for later PWA/Minion use — no rendered UI in this track. | none |

## Error Scenarios

- **Codegen drift**: generated TS/Python differs from schema → CI `validate-specs` fails with a clear diff. Fix = regenerate and commit.
- **Email invariant drift**: the three pinned constants disagree → CI grep test fails, naming all three paths and their differing values.
- **Workspace doesn't build from clean checkout**: a fresh `pnpm install` / `uv sync` + lint + typecheck must succeed; treated as a release blocker, not a warning.

## Acceptance Criteria

- [ ] AC-1: From a clean checkout, `pnpm install` + `pnpm lint` + `pnpm typecheck` succeed for `pwa/`, `trigger-api/`, `shared/`.
- [ ] AC-2: From a clean checkout, `uv sync` + `ruff check` + `ruff format --check` + `pyright` succeed for `minion/`. The F-001 `spike/` package is **excluded from pyright** (throwaway plumbing slated for deletion; pre-existing strict-mode errors on `main`) but **remains covered by ruff check + format**. Resolved during /build — see plan AD-6.
- [ ] AC-3: `shared/schema/` JSON Schema exists; running the documented codegen command produces TS + Python output identical to what is committed (sync check passes).
- [ ] AC-4: The allowed-email constant is present and byte-identical in `firestore.rules`, `trigger-api/src/auth.ts`, and `pwa/src/config.ts`; the CI grep test passes when they match and fails when artificially desynced.
- [ ] AC-5: Root `CLAUDE.md` exists and its documented build/lint/test/codegen commands all actually run successfully when executed.
- [ ] AC-6: `.github/workflows/` contains `build-minion`, `deploy-pwa`, `validate-specs` as valid, runnable workflow stubs invoking the checks above.
- [ ] AC-7: `pnpm-lock.yaml` and `uv.lock` are committed and up to date.
- [ ] AC-8: No secrets or `.env` with real values committed (constitution §5); the spike directories (`minion/src/minion/spike/`, `infra/spike/`, spike scripts) are left untouched.

## Out of Scope

- Any Minion business logic / the 9-step state machine (F-003).
- Any real PWA views, components, auth, or Firestore reads (F-009).
- The `trigger-api` JWT verification logic beyond an empty handler + the pinned email constant (F-008).
- Real CI deploy targets (Firebase deploy, Cloud Run build/push) — workflows are stubs/guarded here (F-007).
- Firestore Security Rules logic beyond declaring the allowed-email constant (full rules in F-009).
- The full/final shared data model — only a demonstrable skeleton schema (full models in F-003).

## Open Questions

- **OQ-1**: Which exact string is the canonical allowed-operator email to pin in the three locations? (Memory notes the GCP project uses a personal gmail, not the SFEIR work account — confirm the precise address before pinning. It will live in git, so confirm that's acceptable.)
- **OQ-2**: Codegen toolchain choice — e.g. `json-schema-to-typescript` for TS and `datamodel-code-generator` for Pydantic, vs a single tool. Both satisfy "JSON Schema → TS + Python"; pick at `/plan` time. (Constitution §3 marks `shared/` types **Flexible**.)
- **OQ-3**: Does `trigger-api/` get a Python or TypeScript skeleton? Constitution §5 quality gates mention `ruff/pyright … trigger-api/` (implying Python), but §3 leaves runtime flexible and PRD §8 is silent. Resolve at `/plan`.
- **OQ-4**: Minimal initial schema scope for `shared/` — just the run-status enum, or also a `Run`/`RunStep` shape? Enough to prove codegen round-trips without pre-empting F-003's models.
