#!/usr/bin/env bash
# scripts/spike-cloud.sh — T-4.3
#
# Builds the spike image for linux/amd64, pushes it to Artifact Registry, and (if the
# Cloud Run Job already exists) bumps the Job's image + entrypoint args.
#
# Terraform owns the Job *shape* and ignores image changes, so this script's
# `gcloud run jobs update --image` doesn't drift TF state.
#
# First-time bootstrap order:
#   1. ./scripts/spike-cloud.sh           # pushes :latest (+ :dev-<sha>); Job not created yet
#   2. terraform -chdir=infra/spike apply # creates the Job pointing at :latest
#   3. ./scripts/spike-cloud.sh           # now also bumps the Job to :dev-<sha>
#
# Usage: ./scripts/spike-cloud.sh [ARGS]
#   ARGS overrides the container entrypoint args (default "run"; e.g. "claude-probe").

set -euo pipefail

PROJECT_ID="veilleur-app"
EXPECTED_ACCOUNT="aurelien.allienne@gmail.com"
REGION="europe-west1"
REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/minion"
JOB="spike-minion"
ARGS="${1:-run}"

# ─── precondition: personal account active (docker cred helper uses it) ──────────────────
active_account="$(gcloud config get-value account --quiet 2>/dev/null || true)"
if [[ "$active_account" != "$EXPECTED_ACCOUNT" ]]; then
  echo "ERROR: active gcloud account is '$active_account', expected '$EXPECTED_ACCOUNT'." >&2
  echo "Fix with: gcloud config set account $EXPECTED_ACCOUNT" >&2
  exit 1
fi

SHA="$(git rev-parse --short HEAD)"
IMAGE_TAG="${REPO}/spike:dev-${SHA}"
IMAGE_LATEST="${REPO}/spike:latest"

# ─── ensure docker can push to Artifact Registry (idempotent) ────────────────────────────
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo ">> building + pushing ${IMAGE_TAG} (+ :latest)"
docker buildx build --platform linux/amd64 \
  -t "$IMAGE_TAG" -t "$IMAGE_LATEST" \
  --push minion/

# ─── bump the Job image+args if the Job exists; otherwise instruct to apply Terraform ────
if gcloud run jobs describe "$JOB" --region="$REGION" --project="$PROJECT_ID" \
     --account="$EXPECTED_ACCOUNT" >/dev/null 2>&1; then
  echo ">> updating Cloud Run Job '${JOB}' -> ${IMAGE_TAG} (args: ${ARGS})"
  gcloud run jobs update "$JOB" \
    --region="$REGION" --project="$PROJECT_ID" --account="$EXPECTED_ACCOUNT" \
    --image="$IMAGE_TAG" --args="$ARGS"
  echo ">> execute with: gcloud run jobs execute $JOB --region=$REGION --wait"
else
  echo ">> Job '${JOB}' does not exist yet. Create it with:"
  echo "     terraform -chdir=infra/spike apply"
  echo "   then re-run this script to bump the image."
fi
