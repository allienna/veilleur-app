#!/usr/bin/env bash
# scripts/deploy-minion.sh — F-007 T-3.1 (production; promoted from spike-cloud.sh).
#
# Builds the production Minion image for linux/amd64, pushes it to Artifact Registry, and (if the
# Cloud Run Job exists) bumps the Job's image. Terraform owns the Job *shape* and ignores image
# changes, so this script's `gcloud run jobs update --image` does not drift TF state.
#
# BUILD CONTEXT IS THE REPO ROOT (the Minion needs the ../shared path dependency), so the build
# uses `-f minion/Dockerfile .` — NOT `minion/` as the context.
#
# First-time bootstrap order (Artifact Registry repo is owned by the spike state; the Job needs a
# real image before Terraform can create it):
#   1. ./scripts/deploy-minion.sh            # pushes :latest (+ :dev-<sha>); Job not created yet
#   2. terraform -chdir=infra apply          # creates the Job pointing at :latest
#   3. ./scripts/deploy-minion.sh            # now also bumps the Job to :dev-<sha>
#
# Override the gcloud account if needed:
#   VEILLEUR_GCLOUD_ACCOUNT=you@example.com ./scripts/deploy-minion.sh

set -euo pipefail

PROJECT_ID="veilleur-app"
EXPECTED_ACCOUNT="${VEILLEUR_GCLOUD_ACCOUNT:-aurelien.allienne@gmail.com}"
REGION="europe-west1"
REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/minion"
JOB="minion"

# Resolve the repo root so the script works from anywhere.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ─── precondition: the personal veilleur-app account must be active (not the Adeo work one) ──
active_account="$(gcloud config get-value account --quiet 2>/dev/null || true)"
if [[ "$active_account" != "$EXPECTED_ACCOUNT" ]]; then
  echo "ERROR: active gcloud account is '$active_account', expected '$EXPECTED_ACCOUNT'." >&2
  echo "Fix with: gcloud config set account $EXPECTED_ACCOUNT" >&2
  exit 1
fi

SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
IMAGE_TAG="${REPO}/minion:dev-${SHA}"
IMAGE_LATEST="${REPO}/minion:latest"

# ─── ensure docker can push to Artifact Registry (idempotent) ────────────────────────────
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo ">> building + pushing ${IMAGE_TAG} (+ :latest) [context: repo root]"
docker buildx build --platform linux/amd64 \
  -f "${ROOT}/minion/Dockerfile" \
  -t "$IMAGE_TAG" -t "$IMAGE_LATEST" \
  --push "$ROOT"

# ─── bump the Job image if it exists; otherwise instruct to apply Terraform ───────────────
if gcloud run jobs describe "$JOB" --region="$REGION" --project="$PROJECT_ID" \
     --account="$EXPECTED_ACCOUNT" >/dev/null 2>&1; then
  echo ">> updating Cloud Run Job '${JOB}' -> ${IMAGE_TAG}"
  gcloud run jobs update "$JOB" \
    --region="$REGION" --project="$PROJECT_ID" --account="$EXPECTED_ACCOUNT" \
    --image="$IMAGE_TAG"
  echo ">> smoke it with: gcloud run jobs execute $JOB --region=$REGION --wait"
else
  echo ">> Job '${JOB}' does not exist yet. Create it with:"
  echo "     terraform -chdir=infra apply"
  echo "   then re-run this script to bump the image."
fi
