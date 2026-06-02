# Tasks: Cloud Run deployment + Cloud Scheduler + kill-switch

**Plan**: specs/007-cloud-run-scheduler/plan.md
**Status**: Ready
**Total**: 15 tasks across 3 phases (T-3.5 is operator-run, outside CI)

Conventions: Terraform `fmt -check` + `validate` (hermetic, no creds — `init -backend=false`); the
image builds for `linux/amd64`; the budget-killswitch function does its google/functions-framework
imports lazily so its unit test needs only `pytest`. **AC-8 / production bring-up (T-3.5) requires
live GCP credentials and is run by the operator — it is not a CI gate.**

## Phase 1: Production image + `/generate` plugin

- [x] **T-1.1**: Promote the Dockerfile entrypoint to the real CLI
  - **Do**: In `minion/Dockerfile` switch `ENTRYPOINT ["python", "-m", "minion.spike"]` →
    `ENTRYPOINT ["python", "-m", "minion"]` with `CMD ["run"]`. Update the header comment (no longer
    the spike image; amd64 + non-root unchanged). Keep the multi-stage venv + Node 20 + claude-code
    + git layers as-is.
  - **Test**: `grep -q 'ENTRYPOINT \["python", "-m", "minion"\]' minion/Dockerfile && grep -q 'CMD \["run"\]' minion/Dockerfile`

- [x] **T-1.2**: Vendor `/generate` + copy it into the image (REVISED — AD-2 superseded)
  - **Discovery**: the `allienna/claude-feature-flow` plugin does **not** contain `/generate` (it has
    the generic spec-workflow commands only). `/generate` is a **legacy Veilleur v1** command
    (source: `allienna/veilleur/.claude/skills/generate/`). Resolution (user-approved): **vendor it**
    in this repo and amend the constitution. See [[generate-command-origin]].
  - **Do**: Port the legacy skill (SKILL + writing-guide + article-template) into a single
    self-contained `minion/.claude/commands/generate.md` adapted to the F-005 contract (reads the
    Minion's context JSON at `$ARGUMENTS`; emits one `GeneratedArticle` JSON on stdout; caps +
    copyright rules matching `generate/validate.py`). `COPY --chown=minion:minion .claude/commands/`
    into `/home/minion/.claude/commands/` in the Dockerfile. Update constitution §3/§4 to match.
    Never bake `ANTHROPIC_API_KEY`.
  - **Test**: `test -f minion/.claude/commands/generate.md && grep -q '.claude/commands/' minion/Dockerfile && grep -q 'minion/.claude/commands/generate.md' specs/constitution.md`

- [x] **T-1.3**: Build for amd64 + in-image smoke
  - **Do**: Add `scripts/image-smoke.sh` (non-login shell so PATH keeps the venv) checking git,
    node, `claude --version`, the vendored `/generate` file, `python -m minion --help`, and non-root
    uid. **Build context is the repo root** (the Minion needs the `../shared` path dep): added a root
    `.dockerignore` and reworked the Dockerfile to COPY `shared/` + `minion/`. Discovered + fixed:
    the image had been unbuildable since F-002 (cross-package path dep outside the `minion/` context).
  - **Test**: `docker buildx build --platform linux/amd64 -f minion/Dockerfile -t veilleur-minion:dev --load . && ./scripts/image-smoke.sh veilleur-minion:dev` ✅ (verified locally)

## Phase 2: Terraform production root + kill-switch function

- [x] **T-2.1**: Terraform skeleton — versions + variables
  - **Do**: Create `infra/versions.tf` (terraform + `hashicorp/google` provider pins mirroring
    `infra/spike/versions.tf`) and `infra/variables.tf`: `project_id` (default `veilleur-app`, the
    spike's validation block), `region` (`europe-west1`), `billing_account` (id, no default),
    `plugin_ref`, `budget_amount_eur` (default 30).
  - **Test**: `terraform -chdir=infra fmt -check && terraform -chdir=infra init -backend=false`

- [x] **T-2.2**: Enable only the new APIs
  - **Do**: Create `infra/apis.tf` enabling the APIs the spike does **not** already manage —
    `cloudscheduler`, `pubsub`, `cloudfunctions`, `cloudbuild`, `billingbudgets`, `eventarc`,
    `run` (reference only if needed) — each `google_project_service` with
    `disable_on_destroy=false`. Comment that shared singletons + their APIs stay owned by the spike
    state (plan AD-2 / Open Q#2).
  - **Test**: `terraform -chdir=infra validate`

- [x] **T-2.3**: IAM — runtime SA, scheduler SA, function SA
  - **Do**: Create `infra/iam.tf`: `google_service_account "minion_sa"` with per-secret
    `secretAccessor` bindings on the 3 active secrets (gmail / anthropic-oauth / github-pat) and
    project roles `aiplatform.user` + `datastore.user`; `google_service_account
    "scheduler_invoker_sa"`; the function SA. (Job-scoped `run.invoker` binding lives with the Job in
    T-2.4.) All bindings additive (reference existing secret IDs by string).
  - **Test**: `terraform -chdir=infra validate`

- [x] **T-2.4**: Cloud Run Job (production)
  - **Do**: Create `infra/job.tf`: `google_cloud_run_v2_job "minion"` (location `europe-west1`, SA
    `minion-sa`, `max_retries=0`, `timeout=1200s`, image
    `${region}-docker.pkg.dev/${project}/minion/minion:latest`, args `["run"]`, `ignore_changes` on
    image + client metadata). Add a `google_cloud_run_v2_job_iam_member` granting
    `roles/run.invoker` on the Job to `scheduler-invoker-sa` only.
  - **Test**: `terraform -chdir=infra validate`

- [x] **T-2.5**: Cloud Scheduler daily trigger (FR-A1)
  - **Do**: Create `infra/scheduler.tf`: `google_cloud_scheduler_job "minion_daily"` — cron
    `0 6 * * *`, `time_zone="Europe/Paris"`, HTTP target to the Jobs run endpoint
    (`https://${region}-run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/minion:run`),
    `oauth_token`/`oidc_token` block authenticated by `scheduler-invoker-sa`.
  - **Test**: `terraform -chdir=infra validate`

- [x] **T-2.6**: Budget-killswitch Cloud Function source + unit test
  - **Do**: Create `functions/budget-killswitch/main.py` (a `functions_framework.cloud_event`
    handler: decode the Pub/Sub budget message, and on `costAmount/budgetAmount >= 1.0` call
    `scheduler.jobs.pause` on the `minion-daily` job — google/functions-framework imports done
    **lazily** so the test needs only pytest), `requirements.txt` (`functions-framework`,
    `google-cloud-scheduler`), and `test_killswitch.py` (≥100 % → pause called once; <100 % → no-op,
    via a fake client).
  - **Test**: `cd functions/budget-killswitch && uv run --with pytest pytest -q`

- [x] **T-2.7**: Kill-switch infrastructure (budget → Pub/Sub → function)
  - **Do**: Create `infra/killswitch.tf`: a Pub/Sub topic; `google_billing_budget` (30 EUR/mo on
    `var.billing_account`, thresholds 0.8 + 1.0, `pubsub_topic` notification); a
    `google_cloudfunctions2_function` (2nd-gen, Python) deploying `functions/budget-killswitch/`,
    triggered by the topic, running as the function SA; the function SA's
    `roles/cloudscheduler.admin` (pause permission, scoped as tight as the API allows). Comment:
    "Disabling this kill-switch requires a PR (constitution §2.10)."
  - **Test**: `terraform -chdir=infra validate`

- [x] **T-2.8**: Outputs + full Terraform gate
  - **Do**: Create `infra/outputs.tf` (job name, scheduler job name, `minion-sa` /
    `scheduler-invoker-sa` emails, Artifact Registry URL).
  - **Test**: `terraform -chdir=infra fmt -check && terraform -chdir=infra validate`

## Phase 3: Deploy tooling, CI, runbook, bring-up

- [x] **T-3.1**: Production deploy script
  - **Do**: Create `scripts/deploy-minion.sh` (promote `scripts/spike-cloud.sh`): build
    `linux/amd64`, push `minion:latest` + `minion:dev-<sha>` to Artifact Registry, then
    `gcloud run jobs update minion --image=…`. Preserve the account/project preconditions (personal
    `veilleur-app` account, not the Adeo work account) and document the bootstrap order (AR repo →
    first push → Job apply → image bump) in the header.
  - **Test**: `bash -n scripts/deploy-minion.sh && grep -q 'linux/amd64' scripts/deploy-minion.sh && grep -q 'run jobs update minion' scripts/deploy-minion.sh`

- [x] **T-3.2**: CI — Terraform validate + function test (hermetic)
  - **Do**: In `.github/workflows/validate-specs.yml` add a job/steps: `terraform fmt -check` +
    `terraform init -backend=false` + `terraform validate` on `infra/`, and the
    `functions/budget-killswitch` pytest. No GCP creds; no apply.
  - **Test**: `grep -q 'terraform' .github/workflows/validate-specs.yml && grep -q 'budget-killswitch' .github/workflows/validate-specs.yml`

- [x] **T-3.3**: Runbook + infra README
  - **Do**: Rewrite `infra/README.md` (production layout; `spike/` deletion deferred to F-013;
    pointer to the runbook) and create `infra/RUNBOOK.md` documenting, in order: `terraform apply`,
    secret population (`scripts/add-secret-versions.sh`), first image push (`deploy-minion.sh`), Job
    creation, **enabling the Scheduler**, the manual smoke (`gcloud run jobs execute minion`),
    verifying the first 06:00 run, the Gmail/Anthropic OAuth re-auth procedure (PRD R3), and
    kill-switch operation (incl. "disabling it requires a PR").
  - **Test**: `test -f infra/RUNBOOK.md && grep -q 'run jobs execute minion' infra/RUNBOOK.md && grep -qi 're-auth\|reauth' infra/RUNBOOK.md`

- [x] **T-3.4**: Final repo-wide gate
  - **Do**: Ensure nothing regressed: minion §5 gate still green, `terraform fmt -check`/`validate`
    clean, function test green, `check:email` + `check:codegen` green.
  - **Test**: `cd minion && uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest && cd .. && terraform -chdir=infra fmt -check && terraform -chdir=infra validate && pnpm check:email`

- [ ] **T-3.5** *(operational — operator-run, NOT CI; AC-8 evidence)*: Production bring-up
  - **Do**: On a host with live GCP creds and the **personal `veilleur-app` account active**, run the
    runbook: `terraform -chdir=infra apply` → populate any missing secrets → `scripts/deploy-minion.sh`
    (first image push + Job bump) → enable the Scheduler → `gcloud run jobs execute minion` smoke →
    confirm `runs/{date}` + `articles/{date}` written and an article committed → observe the first
    06:00 scheduler-fired run the next morning. Record evidence (job logs / run doc / commit URL) in
    the track.
  - **Test**: Manual — `gcloud run jobs execute minion --region europe-west1` completes; Firestore
    shows `runs/{date}` = success/`success_with_warnings` and `articles/{date}` present; the 06:00
    run lands next day. (Not run in CI.)
