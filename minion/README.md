# Veilleur Minion

The Minion is the one-shot Cloud Run Job that runs the daily Veilleur pipeline. It is
**feature-complete** (F-003 → F-008): the nine-step state machine pulls Gmail newsletters,
scrapes the linked articles (Jina), assembles context, runs the agentic `/generate` step
(`claude -p`), validates output + copyright, generates the Imagen hero image, commits the
article to the publish repo, and writes the result + run state to Firestore — with push
notifications on completion (F-012). See the [top-level README](../README.md) for the whole
system and [`infra/RUNBOOK.md`](../infra/RUNBOOK.md) for operating it in production
(bring-up, deploy, **OAuth re-auth**, kill-switch, replay).

The `minion.spike` module (feature F-001) is retained as the de-risking spike that first
proved the plumbing end-to-end:

- Claude Code Max OAuth works **headlessly inside the container** via
  `CLAUDE_CODE_OAUTH_TOKEN` (from Secret Manager), with **no `ANTHROPIC_API_KEY`** (PRD R1).
- The full IAM chain works under a dedicated service account in a deployed Cloud Run Job
  (PRD R9).

## CLI

```
python -m minion run --date YYYY-MM-DD           # the daily pipeline (idempotent by date)
python -m minion.spike run [--date YYYY-MM-DD]   # F-001 spike: Gmail -> Imagen -> Firestore -> GitHub
python -m minion.spike claude-probe              # F-001 spike: claude -p must return PONG
```

> **Auth recovery:** if a run hard-fails on `gmail` (revoked refresh token) or `generate`
> (expired Claude OAuth), follow [`infra/RUNBOOK.md` §3 OAuth re-auth](../infra/RUNBOOK.md#3-oauth-re-auth-gmail--anthropic--prd-r3).

## Prerequisites (one-time)

All commands assume the **personal** Google account that owns the `veilleur-app` GCP
project — NOT an Adeo work account. The gcloud CLI and ADC are independent identities;
set both.

1. **Authenticate gcloud + ADC (same personal account):**
   ```bash
   gcloud auth login                          # pick the personal gmail account
   gcloud auth application-default login      # same account — used by the Python SDKs
   gcloud config set project veilleur-app
   gcloud config set account aurelien.allienne@gmail.com   # the personal account that owns veilleur-app
   gcloud auth configure-docker europe-west1-docker.pkg.dev
   ```
   The helper scripts default to that account; override with
   `VEILLEUR_GCLOUD_ACCOUNT=you@example.com` if you fork this for a different operator.
   Verify both identities match:
   ```bash
   gcloud config get-value account
   TOKEN=$(gcloud auth application-default print-access-token)
   curl -s "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=$TOKEN" \
     | python3 -c "import sys,json;print(json.load(sys.stdin)['email'])"
   ```

2. **Capture the Claude OAuth token:**
   ```bash
   claude setup-token        # copy the sk-ant-oat-... value for step 5
   ```

3. **Issue a GitHub fine-grained PAT** at
   https://github.com/settings/personal-access-tokens/new
   - Repository access: Only select repositories -> `allienna/veilleur-app`
     (migration-phase target; the eventual target is `allienna/veilleur`)
   - Permissions: Contents = Read and write, Metadata = Read-only
   - Copy the `github_pat_...` value for step 5.

## Provision infrastructure

4. **Terraform** (APIs, Secret Manager slots, service account + IAM, Firestore DB,
   Artifact Registry, Cloud Run Job shape):
   ```bash
   cd infra/spike
   terraform init
   terraform apply
   cd ../..
   ```

5. **Populate the three active secrets** — the script prints a runbook for each and exits
   non-zero until all are present:
   ```bash
   ./scripts/add-secret-versions.sh
   ```
   For `gmail-oauth-refresh-token` you need an authorized-user JSON (a Desktop-type OAuth
   client + a one-time consent flow); the script's runbook walks through it. Re-run until
   it exits 0.

   **F-012 — `vapid-private-key`:** the Minion signs Web Push payloads (pywebpush) with the VAPID
   private key. Generate the keypair once (`npx web-push generate-vapid-keys`), add the private
   half as a secret version, and put the public half in the PWA's `VITE_VAPID_PUBLIC_KEY`. See
   [`pwa/README.md`](../pwa/README.md) "Push notifications" for the full runbook.

## Run

6. **Local container run** (uses your mounted ADC, not the service account):
   ```bash
   docker buildx build --platform linux/amd64 -t veilleur-spike:dev minion/
   ./scripts/spike-local.sh
   ```

7. **Deploy + run on Cloud Run:**
   ```bash
   ./scripts/spike-cloud.sh                                   # build, push, bump the Job
   gcloud run jobs execute spike-minion --region=europe-west1 --args=claude-probe --wait
   gcloud run jobs execute spike-minion --region=europe-west1 --wait   # full 4-step run
   ```

8. **Inspect results:** the run's structured logs are in Cloud Logging; the run record is
   at a `runs/spike-{date}-{id}` document in Firestore (e.g. `runs/spike-2026-05-26-5b88f35e`);
   the probe image is committed to `allienna/veilleur-app` under
   `site/public/images/spikes/` (one `.webp` per date).

## Troubleshooting

- **`exec format error` / image won't start on Cloud Run** — the image must be built for
  `linux/amd64`. On Apple Silicon always pass `--platform linux/amd64` (the helper scripts
  and Dockerfile header already do).
- **`RuntimeError: ANTHROPIC_API_KEY is set in env`** — the spike refuses to run with the
  API key present (constitution §2). `unset ANTHROPIC_API_KEY` before running.
- **`PERMISSION_DENIED` from a Python SDK while gcloud CLI works** — your ADC identity
  differs from the CLI identity. Re-run `gcloud auth application-default login` with the
  personal account (see the verify snippet in step 1).
- **`--dangerously-skip-permissions cannot be used with root/sudo`** — `claude -p` will not
  run as root. The image runs as the non-root `minion` user; if you override the user,
  restore it.
- **`terraform plan` shows drift on the Cloud Run Job after a deploy** — expected only for
  `image`/`client`/`client_version`, which are under `ignore_changes`. Any other drift is
  real; investigate.
- **gcloud keeps switching back to the Adeo work account** — re-run
  `gcloud config set account aurelien.allienne@gmail.com`; the helper scripts assert this and
  fail fast.
