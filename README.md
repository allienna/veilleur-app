# Veilleur

**Veilleur** is a fully-autonomous daily tech-watch pipeline. Every morning a one-shot job pulls the
operator's newsletters, scrapes the linked articles, has Claude write a single synthesized article +
LinkedIn post + hero-image prompt, generates the image, publishes to a static site, and pushes a
notification to the operator's phone. A PWA lets the operator read, share, supervise live runs, and
trigger one manually — the whole daily ritual, no laptop required.

This repository is also the subject of a **DevLille 2026 talk**: it is built end-to-end with
*spec-driven development* — every feature flows `spec → plan → tasks → implement → review` under
`specs/`, and the daily pipeline's core step literally executes a versioned slash-command spec. The
repo is meant to be read as an exemplar of that method.

## Read the repo in this order

The project is driven top-down by a chain of authoritative documents. To understand *why* anything
is the way it is, read them in this order:

1. **[`PRD.md`](PRD.md)** — product requirements: what Veilleur is and the acceptance bar.
2. **[`specs/constitution.md`](specs/constitution.md)** — the non-negotiable engineering principles
   (the allowed-email invariant, no `ANTHROPIC_API_KEY` at runtime, idempotent-by-date runs, the
   budget kill-switch, …). These override everything else.
3. **[`DESIGN.md`](DESIGN.md)** — the design system (tokens + components) the PWA is built from.
4. **[`specs/roadmap.md`](specs/roadmap.md)** — the PRD decomposed into vertically-sliced features
   (F-001 … F-014), ordered by dependency, with per-feature status.
5. **[`specs/`](specs/)** — one folder per feature track, each with `spec.md` / `plan.md` /
   `tasks.md` / `review.md`. This is the build story: read a track's `spec.md` for *what*, `plan.md`
   for *how*, `tasks.md` for the atomic steps, `review.md` for the verdict.
6. **The git history** — Conventional Commits, scoped per feature (`feat(009): …`). It tells the
   same story chronologically.

`CLAUDE.md` is the agent-facing build/lint/test map for every workspace — start there if you are
running the code rather than reading the narrative.

## Workspaces

| Dir | Stack | Manager | Role |
|---|---|---|---|
| [`minion/`](minion/) | Python 3.12 + Pydantic | `uv` | One-shot Cloud Run Job: the daily pipeline. |
| [`pwa/`](pwa/) | React 18 + TS + Vite | `pnpm` | Reading + LinkedIn-share + supervision + trigger PWA. |
| [`trigger-api/`](trigger-api/) | TypeScript (Node) | `pnpm` | Cloud Run service: verifies the operator's Firebase JWT, invokes the Minion job. |
| [`shared/`](shared/) | JSON Schema → TS + Pydantic | `pnpm` (+ `uvx`) | Single source of truth for cross-boundary types (codegen, committed + CI-verified). |
| [`infra/`](infra/) | Terraform / gcloud | — | Infrastructure-as-code. |

`minion/` is a standalone `uv` project; `pwa`, `trigger-api`, `shared` are pnpm workspace members.

## Run each workspace

```bash
# Bootstrap
pnpm install                 # TS workspaces (pwa, trigger-api, shared)
cd minion && uv sync         # Python workspace

# TS workspaces (from repo root)
pnpm lint                    # eslint across all TS packages
pnpm typecheck               # tsc --noEmit across all TS packages
pnpm build                   # build all TS packages
pnpm --filter @veilleur/pwa run dev      # local PWA dev server

# minion (from minion/)
uv run ruff check .          # lint
uv run pyright               # type check
uv run pytest                # tests
python -m minion run --date YYYY-MM-DD    # run the daily pipeline locally

# shared — regenerate types from schema (from repo root)
pnpm gen                     # regenerate TS + Pydantic from shared/schema/*.json
pnpm check:codegen           # fail if committed output drifted
```

See [`CLAUDE.md`](CLAUDE.md) for the full per-workspace command reference and the allowed-email
invariant check, and each workspace's own README ([`minion/README.md`](minion/README.md),
[`pwa/README.md`](pwa/README.md)) for details.

## Operating in production

Production bring-up, routine deploys, the **OAuth re-auth runbooks** (Gmail / Anthropic, plus the
API-key break-glass), the budget kill-switch, and failed-day replay all live in
**[`infra/RUNBOOK.md`](infra/RUNBOOK.md)**. These steps need live GCP credentials and are run by the
operator — they are not part of CI.
