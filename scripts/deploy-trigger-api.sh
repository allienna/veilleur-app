#!/usr/bin/env bash
# scripts/deploy-trigger-api.sh — F-008 T-3.4 (production; operator-run).
#
# Builds the trigger-api image for linux/amd64 from the REPO ROOT (pnpm workspace), pushes it to
# Artifact Registry, and (if the service exists) bumps the Cloud Run *service* image. Terraform owns
# the service shape and ignores image changes, so this does not drift TF state.
#
# Bootstrap order: the AR repo (`minion`) is owned by the spike state; push an image, then
# `terraform -chdir=infra apply` creates the service, then re-run this to bump it.
#
#   VEILLEUR_GCLOUD_ACCOUNT=you@example.com ./scripts/deploy-trigger-api.sh

set -euo pipefail

PROJECT_ID="veilleur-app"
EXPECTED_ACCOUNT="${VEILLEUR_GCLOUD_ACCOUNT:-aurelien.allienne@gmail.com}"
REGION="europe-west1"
REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/minion"
SERVICE="trigger-api"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ─── precondition: personal veilleur-app account active (not the Adeo work one) ──────────
active_account="$(gcloud config get-value account --quiet 2>/dev/null || true)"
if [[ "$active_account" != "$EXPECTED_ACCOUNT" ]]; then
  echo "ERROR: active gcloud account is '$active_account', expected '$EXPECTED_ACCOUNT'." >&2
  echo "Fix with: gcloud config set account $EXPECTED_ACCOUNT" >&2
  exit 1
fi

SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
IMAGE_TAG="${REPO}/${SERVICE}:dev-${SHA}"
IMAGE_LATEST="${REPO}/${SERVICE}:latest"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo ">> building + pushing ${IMAGE_TAG} (+ :latest) [context: repo root]"
docker buildx build --platform linux/amd64 \
  -f "${ROOT}/trigger-api/Dockerfile" \
  -t "$IMAGE_TAG" -t "$IMAGE_LATEST" \
  --push "$ROOT"

if gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" \
     --account="$EXPECTED_ACCOUNT" >/dev/null 2>&1; then
  echo ">> updating Cloud Run service '${SERVICE}' -> ${IMAGE_TAG}"
  gcloud run services update "$SERVICE" \
    --region="$REGION" --project="$PROJECT_ID" --account="$EXPECTED_ACCOUNT" \
    --image="$IMAGE_TAG"
else
  echo ">> service '${SERVICE}' does not exist yet. Create it with:"
  echo "     terraform -chdir=infra apply"
  echo "   then re-run this script to bump the image."
fi
