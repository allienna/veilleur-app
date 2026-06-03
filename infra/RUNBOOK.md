# Veilleur production runbook (F-007)

Operational procedures for bringing up and running the Minion in production. These steps need
**live GCP credentials** and are run by the operator — they are **not** part of CI.

> **Account precondition (every step):** the active gcloud account MUST be the personal
> `aurelien.allienne@gmail.com` on project `veilleur-app` — **not** the Adeo work account. The
> CLI identity flips back silently; pass `--account=aurelien.allienne@gmail.com` or
> `gcloud config set account aurelien.allienne@gmail.com` first.

## 1. First-time bring-up (the M7 production-live sequence)

```bash
# 0. Auth (personal account + project)
gcloud config set account aurelien.allienne@gmail.com
gcloud config set project veilleur-app

# 1. Populate the Secret Manager versions (slots are created by infra/spike state)
./scripts/add-secret-versions.sh          # gmail refresh token, anthropic OAuth token, github PAT

# 2. Push the first image (Job not created yet — script prints the next step)
./scripts/deploy-minion.sh                # builds linux/amd64 from the repo root, pushes :latest

# 3. Create the production stack (Job, Scheduler, SAs, IAM, kill-switch)
terraform -chdir=infra init
terraform -chdir=infra apply \
  -var="billing_account=XXXXXX-XXXXXX-XXXXXX"   # your billing account id

# 4. Bump the Job to the freshly-built image (now that the Job exists)
./scripts/deploy-minion.sh

# 5. Manual smoke — run the pipeline once, end to end
gcloud run jobs execute minion --region=europe-west1 --wait
```

**Verify the smoke:** in the Firestore console (project `veilleur-app`) check that
`runs/{today}` is `success` (or `success_with_warnings`) and `articles/{today}` exists, and that a
commit landed in the publish target repo (`allienna/veilleur-app` — the migration-phase target; the
flip to `allienna/veilleur` is a documented **post-talk** step, see `minion/src/minion/config.py`).

**Confirm the daily trigger:** the Scheduler job `minion-daily` (cron `0 6 * * *` Europe/Paris) is
created enabled by Terraform. Force one to validate the trigger path end to end:

```bash
gcloud scheduler jobs run minion-daily --location=europe-west1
```

Then confirm the first real **06:00** run lands the next morning. Record evidence (job execution
log, run doc, commit URL) in `specs/007-cloud-run-scheduler/`.

## 2. Routine deploy (new image)

```bash
./scripts/deploy-minion.sh                # build + push + bump the Job image
gcloud run jobs execute minion --region=europe-west1 --wait   # optional smoke
```

## 3. OAuth re-auth (Gmail / Anthropic) — PRD R3

Two OAuth credentials can revoke out from under a production run. A run that hard-fails on auth
surfaces a `gmail: …` or `generate: …` error in the run doc (and, for Gmail, the PWA shows a
re-auth banner linking back here). Each procedure below is self-contained — follow it without prior
context. The Job reads the **latest** secret version on its next run; **no redeploy is needed** after
adding a version.

> **Account precondition applies** (see top of this file): every `gcloud` call needs the personal
> `aurelien.allienne@gmail.com` account on project `veilleur-app`. Append
> `--account=aurelien.allienne@gmail.com --project=veilleur-app` to be safe.

### 3a. Gmail OAuth refresh-token revoked (`gmail-oauth-refresh-token`)

Symptom: the run fails at the `gmail` step, error contains `invalid_grant` / `Token has been
expired or revoked`. Google revokes refresh tokens on password change, scope change, 6-month
inactivity, or manual revocation at <https://myaccount.google.com/permissions>.

You re-consent locally to mint a fresh `authorized_user.json`, then push it as a new secret version.
This reuses the **same OAuth client** seeded for the spike (`gmail.readonly` scope, Desktop app).

```bash
# 1. Re-run the local consent flow against the existing OAuth client JSON (the Desktop-app
#    client downloaded from console.cloud.google.com/apis/credentials). A browser opens; sign
#    in as the operator and approve gmail.readonly. The fresh refresh token prints as JSON.
uv --project minion run python -c "
from google_auth_oauthlib.flow import InstalledAppFlow
flow = InstalledAppFlow.from_client_secrets_file(
    'PATH/TO/DOWNLOADED_CLIENT.json',
    ['https://www.googleapis.com/auth/gmail.readonly'])
creds = flow.run_local_server(port=0)
print(creds.to_json())
" > authorized_user.json

# 2. Sanity-check the blob has refresh_token / client_id / client_secret (token_uri optional).
cat authorized_user.json    # must NOT contain a transient access token only

# 3. Push it as a new secret version (Job picks it up next run; no redeploy).
gcloud secrets versions add gmail-oauth-refresh-token --data-file=authorized_user.json \
  --account=aurelien.allienne@gmail.com --project=veilleur-app

# 4. Clean up the local secret material.
rm authorized_user.json
```

If you no longer have the OAuth **client** JSON, re-create the Desktop-app client first — see the
`gmail-oauth-refresh-token` block printed by `scripts/add-secret-versions.sh` (step 1 there). Then
verify with a manual replay: `gcloud run jobs execute minion --region=europe-west1 --wait`.

### 3b. Anthropic / Claude Code OAuth expired (`anthropic-oauth-token`)

Symptom: the run fails at the `generate` step on an auth/401 error. The Claude Code OAuth token is
valid ~1 year, so this is rare — but rotation or manual revocation triggers it.

```bash
# 1. Mint a fresh token (opens a browser; sign in to the Anthropic account). Prints one line
#    starting "sk-ant-oat-...". Do NOT wrap it in quotes.
claude setup-token

# 2. Push it as a new secret version. printf (no trailing newline) keeps the value byte-exact.
printf %s 'sk-ant-oat-PASTE_HERE' | gcloud secrets versions add anthropic-oauth-token \
  --data-file=- --account=aurelien.allienne@gmail.com --project=veilleur-app
```

The `generate` subprocess injects this as `CLAUDE_CODE_OAUTH_TOKEN`
(`minion/src/minion/generate/runner.py`). Verify with a manual replay as above.

### 3c. API-key fallback (R1) — when OAuth is unavailable

The F-001 spike proved the pipeline also works with a raw `ANTHROPIC_API_KEY` (`spike/claude_probe.py`).
This is the R1 escape hatch if Claude Code OAuth cannot be obtained in time for the talk. **It is not a
runtime toggle**: constitution §2.2 forbids `ANTHROPIC_API_KEY` in the runtime env by default, and
`runner.py` strips it explicitly. Using it is a **deliberate, reviewed code exception**:

1. Create a `anthropic-api-key` secret (`gcloud secrets create … ` + add a version with the key).
2. In a short-lived PR, change `minion/src/minion/generate/runner.py:_subprocess_env()` to inject
   `ANTHROPIC_API_KEY` from that secret **instead of** `CLAUDE_CODE_OAUTH_TOKEN`, and relax the
   `_assert_anthropic_api_key_absent()` guard (`minion/src/minion/secrets.py`) for that path. Note the
   §2.2 exception in the PR body.
3. Deploy (`./scripts/deploy-minion.sh`), run, and **revert the exception** once OAuth is restored.

Prefer 3b whenever possible — the API-key path is a documented break-glass, not the steady state.

## 4. Budget kill-switch operation (constitution §2.10)

- **What it does:** at 100% of the `budget_amount_eur` (30 EUR/mo) cap, the billing budget publishes
  to the `budget-killswitch` Pub/Sub topic; the `budget-killswitch` Cloud Function **pauses** the
  `minion-daily` Scheduler job. No further automated runs fire.
- **Re-enable after a trip (manual, deliberate):**
  ```bash
  gcloud scheduler jobs resume minion-daily --location=europe-west1
  ```
- **Disabling the kill-switch itself requires a PR** — never remove `infra/killswitch.tf` or detach
  the budget out-of-band (constitution §2.10).

## 4b. trigger-api — deploy + live JWT smoke (F-008, AC-9)

The manual-trigger Cloud Run **service**. Prereq: **Firebase Auth enabled** on the project with
Google sign-in (F-009 owns this; until then sign in once manually to mint a token).

```bash
# 1. Build + push the service image (repo-root context)
./scripts/deploy-trigger-api.sh           # pushes :latest; service not created yet → prints next step

# 2. Create the service + SA + bindings
terraform -chdir=infra apply

# 3. Bump to the freshly-built image
./scripts/deploy-trigger-api.sh

# 4. Smoke with a REAL operator Firebase ID token
URL=$(terraform -chdir=infra output -raw trigger_api_url)
curl -s -X POST -H "Authorization: Bearer $OPERATOR_ID_TOKEN" "$URL/trigger"
#   → 202 { "date": "YYYY-MM-DD", "execution": "..." }; a new runs/{date} appears (same shape as cron)

# 5. Negative check — a non-allowed / missing token is rejected
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/trigger"        # → 401
```

Record evidence (the `202`, the `runs/{date}` doc, the `401`) in `specs/008-trigger-api/`.

## 5. Recovery — replay a missed/failed day

Runs are idempotent by date (constitution §2.7); replaying overwrites cleanly:

```bash
gcloud run jobs execute minion --region=europe-west1 \
  --args="run,--date,YYYY-MM-DD" --wait
```

The article + image are persisted to Firestore before the GitHub commit (F-006 FR-6), so a failed
push can be recovered by replaying the date without re-generating from scratch.
