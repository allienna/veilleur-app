# Veilleur Minion

The Minion is the one-shot Cloud Run Job that runs the daily Veilleur pipeline. This
directory currently holds the **Hello-Veilleur spike** (feature F-001): a minimal
container that exercises the full external-system chain — Gmail, Vertex AI (Imagen),
Firestore, GitHub, and `claude -p` — end-to-end, both locally and on Cloud Run. It does
not yet read newsletters or write articles; that is F-003+.

## What the spike proves

- Claude Code Max OAuth works **headlessly inside the container** via
  `CLAUDE_CODE_OAUTH_TOKEN` (from Secret Manager), with **no `ANTHROPIC_API_KEY`** (PRD R1).
- The full IAM chain works under a dedicated service account in a deployed Cloud Run Job
  (PRD R9).

## CLI

```
python -m minion.spike run [--date YYYY-MM-DD]   # Gmail -> Imagen -> Firestore -> GitHub
python -m minion.spike claude-probe              # claude -p must return PONG
```

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
