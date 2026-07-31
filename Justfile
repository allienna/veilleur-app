\
# Command shortcuts for veilleur-app. Thin wrappers only — no logic beyond what
# CLAUDE.md / infra/RUNBOOK.md already document. Run `just` to list recipes.

set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

# --- TS workspaces (pwa, trigger-api, shared) ---

lint:
    pnpm lint

typecheck:
    pnpm typecheck

build:
    pnpm build

check-email:
    pnpm check:email

check-codegen:
    pnpm check:codegen

# Local PWA dev server (vite)
dev:
    pnpm --filter @veilleur/pwa run dev

# --- minion (Python / uv) ---

minion-check:
    cd minion && uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest

# --- Full regression guard (F-013 AC-11) ---

ci: lint typecheck check-email check-codegen minion-check

# --- Production deploys (require live GCP creds — see infra/RUNBOOK.md) ---

deploy-minion:
    ./scripts/deploy-minion.sh

deploy-trigger-api:
    ./scripts/deploy-trigger-api.sh
