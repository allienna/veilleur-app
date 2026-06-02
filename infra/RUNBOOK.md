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
commit landed in the publish target repo (`allienna/veilleur-app` during burn-in — flips to
`allienna/veilleur` in F-013).

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

When a run hard-fails on auth (`gmail-oauth-refresh-token` revoked, or `anthropic-oauth-token`
expired — the Claude Code token is valid ~1 year):

```bash
# Gmail: re-run the local OAuth flow, then add a new secret version
gcloud secrets versions add gmail-oauth-refresh-token --data-file=authorized_user.json

# Anthropic: regenerate with `claude setup-token`, then
claude setup-token            # prints the token
gcloud secrets versions add anthropic-oauth-token --data-file=- <<<"<token>"
```

The Job reads the latest secret version on its next run; no redeploy needed.

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
