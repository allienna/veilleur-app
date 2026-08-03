# Veilleur trigger-api — Cloud Run service (F-008).
#
# BUILD CONTEXT IS THE REPO ROOT (pnpm workspace + lockfile live there). From the repo root:
#   docker buildx build --platform linux/amd64 -f trigger-api/Dockerfile -t veilleur-trigger-api:dev --load .
# `pnpm deploy` produces a self-contained /app (prod deps + built dist); the runtime stage runs it.
#
# The builder stage runs on `$BUILDPLATFORM` (the host arch, e.g. arm64 on Apple Silicon) rather
# than the target `--platform`: pnpm@11's install/build under QEMU amd64 emulation reliably
# crashes on this toolchain (`uv__io_poll: Assertion 'errno == EEXIST' failed`, a libuv/QEMU
# interaction — Node 20 can't substitute, pnpm@11 requires Node >=22.13's `node:sqlite`). Building
# natively and only cross-compiling the final copy-only runtime stage avoids the crash entirely
# (trigger-api has no native/binary deps, so a build produced on one arch runs fine on another).

# ─── Stage 1: install + build + deploy with pnpm (native arch — see note above) ──────────
FROM --platform=$BUILDPLATFORM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
WORKDIR /repo

# Bring in the workspace (the Dockerfile.dockerignore keeps it small).
COPY . .

# Install just trigger-api + its workspace deps, build it, then produce a pruned prod bundle.
RUN pnpm install --frozen-lockfile --filter @veilleur/trigger-api...
RUN pnpm --filter @veilleur/trigger-api build
# --legacy: pnpm 10+ otherwise refuses to deploy a non-injected workspace (trigger-api has no
# workspace deps, so the legacy copy-node_modules behaviour is exactly what we want).
RUN pnpm --filter @veilleur/trigger-api deploy --legacy --prod /app

# ─── Stage 2: runtime ────────────────────────────────────────────────────────────────────
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app /app

# Cloud Run sets $PORT (default 8080); the server reads it.
EXPOSE 8080
CMD ["node", "dist/index.js"]
