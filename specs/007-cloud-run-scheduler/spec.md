# Spec: Cloud Run deployment + Cloud Scheduler + kill-switch

**Track ID**: 007-cloud-run-scheduler
**Roadmap ref**: F-007
**Status**: In Progress
**Created**: 2026-06-02
**Branch**: feat/007-cloud-run-scheduler
**PRD sections**: FR-A1 (daily autonomous trigger), FR-A2 (the agentic step needs the plugin in-image), §4 Performance (≤8 min run, 20 min Job timeout), §5 Architecture (Cloud Run Job + Scheduler), §8 Configuration (secrets, SA IAM, scheduler SA `run.invoker`, budget alert), §10 R7 (budget drift), constitution §2 principle 6 (20-min timeout) + principle 10 (budget kill-switch armed; disabling requires a PR)
**Depends on**: F-006 — Imagen + GitHub publish (**merged** #10; the full local pipeline now runs end-to-end). Builds directly on the F-001 spike, which proved the IAM chain and shipped a working `infra/spike/` Terraform module + `minion/Dockerfile` + deploy scripts to promote.

## Context

Everything F-001…F-006 built runs **locally** today: `python -m minion run` ingests, generates,
images, commits, and persists a real article. F-007 makes it **autonomous in production** — the
**M7 "production live"** milestone. Cloud Scheduler fires the Minion daily at 06:00 Europe/Paris
with no human action, and a budget kill-switch guarantees the 30 €/mo cap can never be breached
silently (constitution §2.10).

The F-001 spike already de-risked and prototyped most of the chain in `infra/spike/` (throwaway):
API enablement, the 5 Secret Manager slots, a runtime SA with **per-secret** accessor bindings,
project IAM (`aiplatform.user`, `datastore.user`), the Firestore Native DB, an Artifact Registry
repo, and a manually-invoked Cloud Run Job. `minion/Dockerfile` is a working multi-stage image
(Python 3.12 + Node 20 + `@anthropic-ai/claude-code` + git, non-root). `scripts/spike-cloud.sh`
builds/pushes/bumps the image; `scripts/add-secret-versions.sh` walks secret population.

F-007 **promotes** that spike infra to a production Terraform root at `infra/` (top level), adds the
two pieces the spike deliberately left out — **Cloud Scheduler** and the **budget kill-switch** —
and finishes the image so the agentic step works in-container (the `/generate` plugin must be
installed, F-005 FR-9). The spike (`infra/spike/`, `scripts/spike-*.sh`, `minion/src/minion/spike/`)
stays in place and is deleted in F-013.

**Nature of this track (important).** F-007 is **infra + ops**, not application code. The
**in-repo, reviewable deliverables** are the production Dockerfile, the `infra/*.tf` Terraform, a
deploy script, CI guard changes, and a runbook. The **operational steps** — `terraform apply`,
populating real secrets, pushing the first image, enabling the Scheduler, and observing the first
06:00 cron run — require live GCP credentials and the operator's hands; they are **documented as a
runbook and executed by the operator**, not automated in CI (see Out of Scope / Open Questions).

## User Stories

- As the **operator**, I want Cloud Scheduler to fire the Minion daily at 06:00 Europe/Paris with
  no human action so the morning article is ready when I open the PWA.
- As the **operator**, I want the production container to run the **real** pipeline
  (`python -m minion run`) with the `/generate` plugin installed so the agentic step works in the
  cloud exactly as it does locally.
- As the **operator**, I want a hard budget kill-switch that disables the Scheduler at 100 % of the
  30 €/mo cap so a runaway cost can never silently drain the account (constitution §2.10).
- As the **operator**, I want every cloud resource defined as reviewable Terraform (+ a deploy
  script and a runbook) so the production setup is reproducible and defensible as a spec-coding
  artefact, not a pile of console clicks.
- As the **operator**, I want the runtime service account scoped to exactly the secrets and roles
  it needs (per-secret accessor, no project-wide grant) so production keeps least-privilege
  (constitution §6).
- As the **operator**, I want a documented, idempotent deploy + re-auth runbook so I can ship a new
  image, rotate a secret, or recover a missed day without rediscovering the steps.

## Functional Requirements

### FR-1: Production container image
Promote `minion/Dockerfile` to production: switch the entrypoint from the spike
(`python -m minion.spike`) to the real CLI (`python -m minion`, default subcommand `run`), keep the
multi-stage build (Python 3.12 + Node 20 + git, non-root `minion` user with a writable HOME for
`claude`), and **install the pinned `allienna/claude-feature-flow` plugin** so `claude -p
"/generate"` resolves in-container (constitution §3, F-005 FR-9). The image MUST build for
`linux/amd64` (Cloud Run runs amd64). `ANTHROPIC_API_KEY` is never baked in (constitution §2.2).

### FR-2: Production Terraform root (`infra/`)
A top-level `infra/` Terraform root (sibling of `infra/spike/`) that declares the production stack,
promoting the spike resources under production names. It MUST cover:
- **API enablement** — `run`, `cloudscheduler`, `aiplatform`, `firestore`, `secretmanager`,
  `artifactregistry`, `iam`, `gmail`, plus the kill-switch chain (`cloudbilling` /
  `billingbudgets`, `pubsub`, `cloudfunctions`, `run`/`eventarc` as needed).
- **Secret Manager** — the 5 slots (`gmail-oauth-refresh-token`, `anthropic-oauth-token`,
  `github-pat-allienna-pages`, `anthropic-api-key-fallback`, `vapid-private-key`); slots only,
  versions populated operationally.
- **Runtime SA** (`minion-sa`) — per-secret `secretAccessor` bindings for the **3 active** secrets
  (gmail / anthropic-oauth / github-pat; `vapid` added in F-012), and project roles
  `aiplatform.user` + `datastore.user`. Never a project-wide secret grant (constitution §6).
- **Firestore** Native DB + **Artifact Registry** `minion` repo (reuse the spike's region
  `europe-west1`; reconcile state ownership — Open Questions).

### FR-3: Cloud Run Job (production)
A `google_cloud_run_v2_job` named `minion` running as `minion-sa`, `max_retries = 0`, **`timeout =
1200s`** (the constitution §2.6 20-minute hard cap), image from Artifact Registry, args `["run"]`.
The Job *shape* is owned by Terraform; the image tag is bumped out-of-band by the deploy script
(`gcloud run jobs update --image=…`), so `image` (and client metadata) are under `ignore_changes`
(spike pattern).

### FR-4: Cloud Scheduler daily trigger (FR-A1)
A `google_cloud_scheduler_job` with cron **`0 6 * * *`**, time zone **`Europe/Paris`**, targeting
the Cloud Run Jobs run endpoint for the `minion` Job, authenticated via a dedicated **scheduler SA**
holding **`roles/run.invoker`** on the Job (and nothing else). A scheduler-fired run MUST produce
an identical run shape to a manual `gcloud run jobs execute` (same Firestore documents, same
outputs — FR-A1 AC). The Job's own concurrency guard (F-003 Firestore lock) prevents overlap.

### FR-5: Budget kill-switch (constitution §2.10 / §10 R7)
A billing budget of **30 €/mo** on the project with alert thresholds at **80 %** (warn) and **100 %**,
publishing to a **Pub/Sub** topic; a **Cloud Function** subscriber that, on the 100 % event,
**disables the Cloud Scheduler job** (`pause`/disable), stopping all further automated runs. The
kill-switch is **armed by default**; re-enabling the Scheduler is a deliberate manual action, and
**disabling the kill-switch itself requires a PR** (constitution §2.10). A warning/notification is
surfaced (email + the PWA banner / push land in later tracks).

### FR-6: Deploy mechanism + bootstrap order
A production deploy script (promote `scripts/spike-cloud.sh` → e.g. `scripts/deploy-minion.sh`):
build `linux/amd64`, push to Artifact Registry (`:latest` + `:<sha>`), and bump the Job image via
`gcloud run jobs update`. It MUST encode the bootstrap ordering (AR repo → first image push → Job
apply → image bump) and the account/project preconditions the spike scripts already enforce
(personal `veilleur-app` account, not the Adeo work account — see session memory). CI auto-deploy is
**out of scope / Open Question** (needs Workload Identity Federation); deploy stays operator-run.

### FR-7: Runbook + operations doc
An `infra/README.md` (replace the spike note) + a runbook documenting, in order: `terraform apply`,
secret population (`add-secret-versions.sh`), first image push, Job creation, **enabling the
Scheduler**, the manual-trigger smoke (`gcloud run jobs execute minion`), verifying the first 06:00
run, the **Gmail/Anthropic OAuth re-auth** procedure (PRD R3; needed by F-013), and how to operate
the kill-switch (and that disabling it needs a PR).

### FR-8: CI guard alignment
Update the workflows so F-007 doesn't break CI: `build-minion` stays the hermetic lint/type/test
gate (unchanged); add a `validate-specs`/terraform check as appropriate (e.g. `terraform fmt
-check` + `validate` on `infra/`, no apply). Any deploy job is **manual/guarded** (no automatic
apply on merge), consistent with `deploy-pwa` being guarded until its track.

## External Interfaces

| Interface | Mechanism | Purpose |
|-----------|-----------|---------|
| Cloud Scheduler → Cloud Run Jobs | OIDC-authed HTTP to the Jobs `:run` endpoint (scheduler SA, `run.invoker`) | Daily 06:00 Europe/Paris trigger (FR-A1). |
| Cloud Run Job → Secret Manager | SA `secretAccessor` per-secret | OAuth token / Gmail refresh / GitHub PAT at runtime. |
| Cloud Run Job → Vertex AI / Firestore | SA `aiplatform.user` / `datastore.user` | Imagen + run/article persistence (no keys). |
| Cloud Billing → Pub/Sub → Cloud Function → Scheduler | budget threshold event → function → `scheduler.jobs.pause` | The 100 %-of-30 € kill-switch (FR-5). |
| Artifact Registry | `gcloud run jobs update --image` | Image distribution + Job image bump (FR-6). |
| `allienna/claude-feature-flow` plugin | installed into the image | Ships `/generate` so the agentic step runs in-container (FR-1). |

## Error Scenarios

| Scenario | Expected handling |
|----------|-------------------|
| Scheduler fires while a run is in progress | Job's Firestore lock aborts the second run `already_running` (F-003) — no double-publish. |
| Run exceeds 20 min | Cloud Run Job `timeout=1200s` kills it; the sentinel/status reflects `timeout` (constitution §2.6). |
| Budget hits 100 % of 30 € | Kill-switch disables the Scheduler; no further automated runs until manual re-enable (FR-5). |
| Secret missing / OAuth expired | Job hard-fails with a clear error (F-004/F-005 boundaries); re-auth runbook (FR-7, PRD R3). |
| Image missing on first apply | Bootstrap order (FR-6) pushes `:latest` before the Job is created; documented in the runbook. |
| `terraform apply` partial failure | Idempotent re-apply; `disable_on_destroy=false` on APIs (spike pattern) avoids re-enable lag. |
| Plugin/`claude` absent in image | Build-time failure (FR-1 installs them); a gated in-image smoke catches regressions before deploy. |

## Acceptance Criteria

- [ ] AC-1: `docker buildx build --platform linux/amd64 minion/` produces an image whose entrypoint
      runs `python -m minion run`, with `claude`, `git`, Node 20, and the `/generate` plugin present,
      running as the non-root `minion` user.
- [ ] AC-2: `terraform -chdir=infra plan` is clean and `validate`/`fmt -check` pass; the root
      declares the Cloud Run Job, Cloud Scheduler job, both SAs, per-secret accessor + project IAM,
      Firestore, Artifact Registry, and the budget→pubsub→function kill-switch.
- [ ] AC-3: the Cloud Run Job is `minion`, runs as `minion-sa`, `max_retries=0`, `timeout=1200s`,
      with `image` under `ignore_changes`.
- [ ] AC-4: the Scheduler job is cron `0 6 * * *` `Europe/Paris`, invokes the Job via a scheduler SA
      that holds **only** `roles/run.invoker` on the Job.
- [ ] AC-5: the kill-switch wiring exists in Terraform — a 30 €/mo budget with 80 %/100 % thresholds,
      a Pub/Sub topic, and a Cloud Function that disables the Scheduler job on the 100 % event.
- [ ] AC-6: the deploy script builds+pushes `linux/amd64` to Artifact Registry and bumps the Job
      image idempotently, encoding the bootstrap order and the account/project preconditions.
- [ ] AC-7: `infra/README.md` + runbook document apply, secret population, first deploy, Scheduler
      enable, the manual-trigger smoke, OAuth re-auth, and kill-switch operation (incl. "disabling
      it needs a PR").
- [ ] AC-8 (**operational, operator-run, out-of-CI**): `gcloud run jobs execute minion` completes a
      real run that publishes an article and writes `runs/{date}` + `articles/{date}`; the first
      06:00 scheduler-fired run lands the next morning. Evidence recorded in the track (logs / run
      doc), not a CI assertion.

## Out of Scope

- **CI/CD auto-apply / auto-deploy on merge** — needs Workload Identity Federation; deploy stays an
  operator-run script + runbook (Open Questions). The Terraform/script/runbook are the deliverable.
- **trigger-api micro-service** (manual trigger endpoint) — F-008.
- **PWA budget/error banners + push notifications** for the kill-switch — F-011 / F-012 (F-007 emits
  the billing/email signal only).
- **VAPID secret population + usage** — slot exists; used in F-012.
- **Deleting `infra/spike/`, `scripts/spike-*.sh`, `minion/src/minion/spike/`** — F-013.
- **The 7-day burn-in** itself — F-013 (F-007 only makes the first production run possible).
- **Multi-environment (staging/prod) split** — single project, single env (PRD §4 no horizontal
  scale).

## Open Questions

1. **GitHub publish target — flip to the real site now?** F-006 publishes to the migration
   placeholder `allienna/veilleur-app@main` (`config.GITHUB_REPO_NAME`). Production-live arguably
   wants the real public site. **Recommendation:** confirm `allienna/veilleur` exists with the
   expected `site/src/content/posts/` + `site/public/images/posts/` layout, then flip
   `GITHUB_REPO_NAME` to `veilleur` as part of F-007; otherwise stay on the placeholder and flip in
   F-013. One-constant change either way — decide in `/plan`.
2. **Terraform state ownership vs the spike.** `infra/spike/` already *created* Firestore (default),
   the Artifact Registry `minion` repo, the secret slots, and APIs — singletons a fresh `infra/`
   root would collide with. Promote by (a) `terraform import` of the shared singletons into the new
   root, (b) `moved {}` blocks, or (c) keep using the spike state until F-013 and have `infra/` add
   only the *new* resources (Job rename, Scheduler, kill-switch)? Decide the migration strategy in
   `/plan`.
3. **Cloud Run Job vs Service for the trigger target.** The daily trigger is a Job (one-shot
   semantics). Confirm Scheduler invokes the Jobs `:run` endpoint via OIDC (vs an intermediary).
   The PWA manual trigger is a separate `trigger-api` (F-008) — F-007 only wires the cron path.
4. **Kill-switch action granularity.** On 100 %, disable only the Scheduler (cheapest, reversible),
   or also stop in-flight Jobs / disable the Job? **Recommendation:** pause the Scheduler only —
   in-flight runs are ≤20 min and ≤ the daily cost; simpler and reversible. Confirm.
5. **Cloud Function runtime + trigger.** 2nd-gen Cloud Function (Python) subscribed to the Pub/Sub
   budget topic vs an Eventarc-triggered Cloud Run service. **Recommendation:** 2nd-gen Python
   function, smallest surface. Confirm, and decide where its source lives (`infra/` vs a small
   `functions/` dir).
6. **CI Terraform validation depth.** Just `fmt -check` + `validate` (no creds), or a plan against a
   read-only SA? **Recommendation:** `fmt`+`validate` only in CI (hermetic); real `plan/apply` is
   operator-run. Confirm.
7. **Budget currency/amount precision.** PRD says 30 €/mo GCP cap; confirm the budget is set in EUR
   on the billing account and whether Imagen's ~0.60 €/mo is in-scope of the same budget (it is —
   single project). Confirm the exact amount + currency in `/plan`.
8. **Region/zone + Firestore location already pinned** to `europe-west1` by the spike — confirm
   production keeps it (it must; Firestore location is permanent).
