#!/usr/bin/env bash
# scripts/spike-local.sh — T-3.4
#
# Runs the spike container on this machine, authenticating via the operator's mounted
# Application Default Credentials. This proves the image runs end-to-end locally.
#
# NOTE: this uses YOUR ADC identity, not the spike-minion-sa service account. The true
# Workload-Identity test happens only in the deployed Cloud Run Job (T-4.5).
#
# Build the image first:  docker buildx build --platform linux/amd64 -t veilleur-spike:dev minion/

set -euo pipefail

IMAGE="${IMAGE:-veilleur-spike:dev}"
DATE="$(date -u +%F)"
ADC_DIR="$HOME/.config/gcloud"

if [[ ! -d "$ADC_DIR" ]]; then
  echo "ERROR: $ADC_DIR not found. Run 'gcloud auth application-default login' first." >&2
  exit 1
fi

echo ">> docker run $IMAGE run --date $DATE  (ADC mounted read-only)"
docker run --rm --platform linux/amd64 \
  -v "$ADC_DIR:/root/.config/gcloud:ro" \
  -e GOOGLE_CLOUD_PROJECT=veilleur-app \
  "$IMAGE" run --date "$DATE"
