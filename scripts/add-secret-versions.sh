#!/usr/bin/env bash
# scripts/add-secret-versions.sh — T-4.1a
#
# Drives the human-in-the-loop population of the 3 actively-used Secret Manager secrets
# for the Hello-Veilleur spike. The Secret slots themselves are created by Terraform
# (infra/spike/main.tf, T-4.1). This script only walks the operator through adding the
# FIRST version of each secret.
#
# For each missing secret, prints a runbook block (where to issue / which scopes) and the
# literal `gcloud secrets versions add` invocation. Exits 1 if any are missing; exits 0
# (printing a one-line confirmation) once all 3 have ≥1 version.

set -euo pipefail

PROJECT_ID="veilleur-app"
EXPECTED_ACCOUNT="${VEILLEUR_GCLOUD_ACCOUNT:-aurelien.allienne@gmail.com}"

# Use --account explicitly to bypass the gcloud "active account flips back to Adeo work"
# pitfall noted in session memory (gcp-veilleur-app-account, gcloud-cli-vs-adc-identity).
GCLOUD_FLAGS=(--project="$PROJECT_ID" --account="$EXPECTED_ACCOUNT")

# ─── precondition: active project must match ─────────────────────────────────
active_project=$(gcloud config get-value project --quiet 2>/dev/null || true)
if [[ "$active_project" != "$PROJECT_ID" ]]; then
  echo "ERROR: gcloud active project is '$active_project', expected '$PROJECT_ID'."
  echo "Fix with: gcloud config set project $PROJECT_ID"
  exit 1
fi

# ─── runbooks (heredocs assigned to vars first — avoids the heredoc-inside-$() pitfall) ──

gmail_runbook=$(cat <<'EOF'
Provision an authorized-user JSON blob with these fields:
  {
    "refresh_token":  "1//...",
    "client_id":      "...apps.googleusercontent.com",
    "client_secret":  "...",
    "token_uri":      "https://oauth2.googleapis.com/token"
  }

You need a Google Cloud OAuth 2.0 Client of type "Desktop app" (or "Web") with the
https://www.googleapis.com/auth/gmail.readonly scope authorized to your operator
Gmail account.

  1. Create the OAuth client (one-time, if you do not already have one):
       https://console.cloud.google.com/apis/credentials?project=veilleur-app
     -> Create credentials -> OAuth client ID -> Desktop app -> name e.g. "veilleur-spike-local".
     Download the JSON; keep client_id + client_secret.

  2. Run a one-shot OAuth helper to obtain the refresh_token, e.g. via
     google_auth_oauthlib:
       uv --project minion run python -c "
       from google_auth_oauthlib.flow import InstalledAppFlow
       flow = InstalledAppFlow.from_client_secrets_file(
           'PATH/TO/DOWNLOADED_CLIENT.json',
           ['https://www.googleapis.com/auth/gmail.readonly'])
       creds = flow.run_local_server(port=0)
       print(creds.to_json())
       "
     The printed JSON is exactly what to paste into Secret Manager.
EOF
)

anthropic_runbook=$(cat <<'EOF'
Run:
  claude setup-token

Copy the entire token string starting with "sk-ant-oat-..." (one line, no surrounding
quotes). The token is valid for 1 year.
EOF
)

github_runbook=$(cat <<'EOF'
Issue a fine-grained Personal Access Token at:
  https://github.com/settings/personal-access-tokens/new

  - Token name:           veilleur-spike-pages
  - Expiration:           1 year (or whatever rotation cadence you prefer)
  - Repository access:    Only select repositories -> allienna/veilleur-app
                          (migration-phase target; eventual target is allienna/veilleur)
  - Repository permissions:
      * Contents:   Read and write
      * Metadata:   Read-only (mandatory; selected automatically)
  - Account permissions:  (none needed)

Copy the token (starts with "github_pat_"). Do NOT use a classic PAT — fine-grained only.
EOF
)

# ─── helper ──────────────────────────────────────────────────────────────────
missing=0

check_secret() {
  local name="$1"
  local runbook="$2"
  local versions
  versions=$(gcloud secrets versions list "$name" "${GCLOUD_FLAGS[@]}" --format='value(name)' 2>/dev/null || true)
  if [[ -n "$versions" ]]; then
    return 0
  fi
  echo ""
  echo "─── MISSING: $name ─────────────────────────────────────────────"
  printf '%s\n' "$runbook"
  echo ""
  echo "Then add the secret version (note --account, to avoid the work-account pitfall):"
  echo "  printf %s 'PASTE_THE_SECRET_VALUE' | gcloud secrets versions add $name --data-file=- --project=$PROJECT_ID --account=$EXPECTED_ACCOUNT"
  echo ""
  missing=$((missing + 1))
}

check_secret "gmail-oauth-refresh-token" "$gmail_runbook"
check_secret "anthropic-oauth-token"     "$anthropic_runbook"
check_secret "github-pat-allienna-pages" "$github_runbook"

# ─── final verdict ───────────────────────────────────────────────────────────
if (( missing > 0 )); then
  echo "─────────────────────────────────────────────────────────────────"
  echo "$missing secret(s) need population. Follow each block above, then re-run this script."
  exit 1
fi

echo "All 3 actively-used secrets have ≥1 version in '$PROJECT_ID'. ✓"
