# Veilleur Minion — production image (F-007).
#
# Multi-stage: a uv builder produces a self-contained venv at /opt/venv (project installed
# NON-editable, so stage 2 needs no source copy), and the runtime stage adds Node 20 +
# @anthropic-ai/claude-code + git on top of python:3.12-slim, plus the vendored `/generate`
# command (minion/.claude/commands/generate.md — ported from the legacy v1 app, constitution §3).
#
# BUILD CONTEXT IS THE REPO ROOT (not minion/): the Minion depends on `veilleur-shared` via a
# path dependency at ../shared (the generated cross-boundary Pydantic models), which lives outside
# minion/. MUST be built for linux/amd64 (Cloud Run Jobs run amd64). From the repo root:
#   docker buildx build --platform linux/amd64 -f minion/Dockerfile -t veilleur-minion:dev .
# Smoke the result with: ./scripts/image-smoke.sh veilleur-minion:dev

# ─── Stage 1: build the Python venv with uv ──────────────────────────────────────────────
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.11.15 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /app/minion

# The veilleur-shared path dependency (../shared, editable) must resolve from minion/pyproject.toml,
# so place shared at /app/shared first. Only its packaging + generated package are needed (not
# node_modules / schema / scripts).
COPY shared/pyproject.toml /app/shared/pyproject.toml
COPY shared/generated/veilleur_shared /app/shared/generated/veilleur_shared

# Deps first (cached unless pyproject/lock/shared change), then the project non-editable.
COPY minion/pyproject.toml minion/uv.lock minion/README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY minion/src ./src
RUN uv sync --frozen --no-dev --no-editable

# ─── Stage 2: runtime (Python + Node 20 + claude-code + git) ──────────────────────────────
FROM python:3.12-slim

# System deps + Node 20 (NodeSource) + the Claude Code CLI the agentic step needs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
       | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
       > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @anthropic-ai/claude-code \
    && apt-get purge -y gnupg \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Quiet gRPC native logs (also set in the package __init__, belt-and-suspenders for the container).
ENV GRPC_VERBOSITY=ERROR \
    GLOG_minloglevel=2

# Run as non-root: `claude -p --permission-mode bypassPermissions` refuses to run as
# root/sudo for security reasons. A dedicated unprivileged user with a writable HOME
# (for claude's config/state) is required for the agentic step.
RUN useradd --create-home --uid 1000 minion
USER minion
WORKDIR /home/minion

# Install the `/generate` slash command so `claude -p "/generate"` resolves for the `minion` user.
# It is a Veilleur-domain command (ported from the legacy v1 app) and is VENDORED in this repo at
# minion/.claude/commands/generate.md — the runtime literally executes this versioned spec (the
# talk thesis). Constitution §3 originally placed it in the claude-feature-flow plugin; that plugin
# has no /generate, so v2 vendors it with the Minion (constitution updated to match).
COPY --chown=minion:minion minion/.claude/commands/ /home/minion/.claude/commands/

ENTRYPOINT ["python", "-m", "minion"]
CMD ["run"]
