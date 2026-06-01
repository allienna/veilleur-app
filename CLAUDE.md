# CLAUDE.md — Veilleur-app

Monorepo for the Veilleur tech-watch pipeline. Read this first; it is the canonical map of how to build, lint, test, and operate every workspace.

**Authoritative docs**: [`PRD.md`](PRD.md) · [`specs/constitution.md`](specs/constitution.md) (non-negotiable principles) · [`specs/roadmap.md`](specs/roadmap.md) · [`DESIGN.md`](DESIGN.md) (design tokens/components — machine-read by `/implement`).

## Workspaces

| Dir | Stack | Manager | Role |
|---|---|---|---|
| `minion/` | Python 3.12 + Pydantic | `uv` | One-shot Cloud Run Job orchestrator (the daily pipeline). |
| `pwa/` | React 18 + TS + Vite | `pnpm` | Supervision + reading + LinkedIn-share PWA. |
| `trigger-api/` | TypeScript (Node) | `pnpm` | Cloud Run service: verifies Firebase JWT, invokes the Minion job. |
| `shared/` | JSON Schema → TS + Pydantic codegen | `pnpm` (+ `uvx`) | Single source of truth for cross-boundary types. |
| `infra/` | Terraform / gcloud | — | IaC (production lands in F-007; `infra/spike/` is throwaway). |

`minion/` is a **standalone uv project**, not a pnpm workspace member. `pwa`, `trigger-api`, `shared` are pnpm workspace members (scoped names `@veilleur/*`).

## Build & Run Commands

### Bootstrap
```bash
pnpm install                 # TS workspaces (pwa, trigger-api, shared)
cd minion && uv sync         # Python workspace
```

### TS workspaces (run from repo root)
```bash
pnpm lint                    # eslint across all TS packages
pnpm typecheck               # tsc --noEmit across all TS packages
pnpm build                   # build all TS packages
pnpm --filter @veilleur/pwa run dev   # local PWA dev server
```

### minion (run from minion/)
```bash
uv run ruff check .          # lint (covers spike/ too)
uv run ruff format --check . # format check
uv run pyright               # type check (spike/ excluded — throwaway, see pyproject)
uv run pytest                # tests
```

### shared — codegen (run from repo root)
```bash
pnpm gen                     # regenerate TS + Pydantic from shared/schema/*.json
pnpm check:codegen           # regenerate and fail if committed output drifted
```
JSON Schema in `shared/schema/` is the source of truth. Generated output in `shared/generated/{ts,python}/` is **committed** and CI-verified. Never hand-edit generated files; edit the schema and run `pnpm gen`. Python codegen requires `uv`/`uvx` (datamodel-code-generator, pinned).

## The allowed-email invariant (constitution §2.1)

The single allowed operator email is pinned, byte-identical, in **exactly three** enforcement locations:
- `firestore.rules`
- `trigger-api/src/auth.ts`
- `pwa/src/config.ts`

Each carries an `allowed-email-pin` marker. CI fails if they diverge:
```bash
pnpm check:email             # scripts/check-allowed-email.sh
```
The PWA client constant is **UX only** — the real boundary is Firestore Rules + trigger-api JWT verification.

## CI (`.github/workflows/`)

- `build-minion` — ruff + format + pyright + pytest for `minion/`.
- `deploy-pwa` — pnpm lint/typecheck/build for `pwa/` (deploy job guarded until F-007).
- `validate-specs` — allowed-email invariant + schema-codegen-sync check.

## Conventions (see constitution §4 for the full list)

- **Python**: Pydantic at every I/O boundary; `ruff` lint+format; no `print` outside the logging boundary.
- **TypeScript**: `strict: true`, no `any`, no `@ts-ignore`; ESLint + Prettier.
- **Lockfiles committed**: `minion/uv.lock`, `pnpm-lock.yaml`. New deps reviewed in the PR description.
- **No secrets in source**; Secret Manager + IAM only.
- **Conventional Commits**, scoped with the feature number (e.g. `feat(002): …`).
- **`specs/`** drives features: `/specify` → `/plan` → `/tasks` → `/implement` (or `/build`) → `/review` → `/ship`.
