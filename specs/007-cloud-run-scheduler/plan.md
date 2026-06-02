# Plan: Cloud Run deployment + Cloud Scheduler + kill-switch

**Spec**: specs/007-cloud-run-scheduler/spec.md

This plan resolves the spec's Open Questions (user decisions on #1–#2; recommendations adopted for
#3–#8) and promotes the F-001 spike infra to a production stack. **Scope reality:** the in-repo
deliverables are the production Dockerfile, the `infra/` Terraform, the budget-killswitch function,
a deploy script, CI guards, and a runbook — all reviewable. The actual `terraform apply`, secret
population, image push, Scheduler enable, and first cron run are **operator-run** (live GCP creds)
and captured by the runbook + AC-8 evidence, not CI.

## Resolved Open Questions

| # | Question | Resolution |
|---|----------|-----------|
| 1 | Flip GitHub publish target now? | **No (user).** Keep `config.GITHUB_REPO_NAME = "veilleur-app"` through burn-in so test runs don't spam the live site; flip to `allienna/veilleur` in F-013. **No app-code change in F-007.** |
| 2 | Terraform state vs the spike | **`infra/` declares only production-NEW resources (user).** The spike state keeps owning shared singletons (Firestore default DB, Artifact Registry `minion`, the 5 secret slots, the spike-enabled APIs). `infra/` adds the Job, Scheduler, SAs, IAM, kill-switch, and only the *new* APIs. No imports. Full consolidation → F-013. |
| 3 | Trigger target | **Cloud Run Job** invoked at the Jobs `:run` endpoint via an OIDC scheduler SA (AD-4). PWA manual trigger is F-008. |
| 4 | Kill-switch granularity | **Pause the Scheduler only** (AD-5) — in-flight runs are ≤20 min / ≤ a day's cost; reversible and simplest. |
| 5 | Cloud Function runtime | **2nd-gen Python** function, source in `functions/budget-killswitch/` (AD-5). |
| 6 | CI Terraform depth | **`fmt -check` + `validate` only** (hermetic, no creds) (AD-6). Real `plan`/`apply` is operator-run. |
| 7 | Budget | **30 EUR/mo** on the billing account, single project (Imagen ~0.60 €/mo included), thresholds 80 % + 100 % (AD-5). |
| 8 | Region / Firestore location | **`europe-west1`** (spike-pinned; Firestore location is permanent) — reused, not re-declared. |

## Architecture Decisions

### AD-1: Promote `minion/Dockerfile` to the production image
- **Choice**: Switch the entrypoint from `python -m minion.spike` to `python -m minion` (default
  subcommand `run`); keep the multi-stage build (Python 3.12 builder venv + Node 20 +
  `@anthropic-ai/claude-code` + git, non-root `minion` user). Add the `/generate` plugin install
  (AD-2). Build `linux/amd64`. `ANTHROPIC_API_KEY` never baked in (constitution §2.2).
- **Rationale**: The spike image already proved the runtime; production only needs the real
  entrypoint + the plugin so the agentic step works in-cloud.
- **Alternatives**: a fresh Dockerfile (rejected — the spike's is correct and battle-tested).

### AD-2: Install the `/generate` plugin into the image at build time
- **Choice**: At build time, fetch the pinned `allienna/claude-feature-flow` plugin and make
  `/generate` resolvable for the `minion` user. **Primary mechanism**: the Claude Code plugin CLI
  (`claude plugin marketplace add allienna/claude-feature-flow` + `claude plugin install` pinned to
  a tag/commit) run as the `minion` user so it lands in `/home/minion/.claude`. **Fallback** (if the
  plugin CLI is unreliable headless): `git clone --depth 1 --branch <pin>` the plugin and copy its
  `commands/generate.md` into `/home/minion/.claude/commands/`. The pin (tag or commit SHA) is a
  build ARG / Dockerfile constant.
- **Rationale**: Constitution §3 mandates the plugin as a pinned, versioned dependency. This is the
  one genuinely-new in-container unknown — covered by a build-time smoke (AD-7) that asserts
  `claude` runs and `/generate` is present.
- **Alternatives**: vendoring `generate.md` into the repo (rejected — violates §3 single-source).

### AD-3: Production runtime SA `minion-sa`, additive least-privilege
- **Choice**: A new `google_service_account "minion_sa"` (distinct from the spike's
  `spike-minion-sa`), with **per-secret** `secretAccessor` bindings on the 3 active secrets
  (gmail / anthropic-oauth / github-pat; `vapid` added in F-012) and project roles
  `roles/aiplatform.user` + `roles/datastore.user`. Bindings reference the existing secret IDs
  (created by the spike) as additive `iam_member` resources.
- **Rationale**: Least-privilege (constitution §6); additive IAM members don't collide with the
  spike's own bindings (different member), honoring the "new resources only" decision.
- **Alternatives**: reuse `spike-minion-sa` (rejected — production shouldn't run under a
  "spike"-named identity slated for deletion).

### AD-4: Cloud Scheduler → Cloud Run Job via OIDC `run.invoker`
- **Choice**: A `google_cloud_scheduler_job` (cron `0 6 * * *`, TZ `Europe/Paris`) issuing an
  OIDC-authed HTTP POST to the Jobs run endpoint
  (`https://{region}-run.googleapis.com/v2/.../jobs/minion:run`), authenticated by a dedicated
  `scheduler-invoker-sa` holding **only** `roles/run.invoker` on the `minion` Job.
- **Rationale**: FR-A1; the dedicated invoker SA keeps the trigger path least-privilege and
  separate from the runtime SA.
- **Alternatives**: `gcloud`-cron via a VM / a Workflows intermediary (rejected — heavier).

### AD-5: Budget kill-switch — budget → Pub/Sub → 2nd-gen function → pause Scheduler
- **Choice**: A `google_billing_budget` of **30 EUR/mo** on the billing account (thresholds 0.8 +
  1.0) publishing to a Pub/Sub topic; a 2nd-gen Python **Cloud Function** (`functions/budget-
  killswitch/`) subscribed to that topic that, on a ≥100 % event, **pauses the `minion` Scheduler
  job** (`scheduler.jobs.pause`). The function's SA holds only `roles/cloudscheduler.admin` (or a
  custom pause-only role) scoped as tightly as the API allows. Re-enabling is manual; **disabling
  the kill-switch requires a PR** (constitution §2.10) — enforced socially + noted in the runbook.
- **Rationale**: Exactly the PRD §5 / §10 R7 design; pause-only is reversible and cheap (AD per
  Open Q#4/#5).
- **Alternatives**: also stop in-flight Jobs / disable the Job (rejected — needless; runs are
  ≤20 min and bounded).

### AD-6: Deploy via an operator-run script; CI validates only
- **Choice**: Promote `scripts/spike-cloud.sh` → `scripts/deploy-minion.sh` (build `linux/amd64`,
  push `:latest` + `:<sha>` to Artifact Registry, `gcloud run jobs update minion --image`),
  preserving the bootstrap order + account/project preconditions (personal `veilleur-app` account,
  not the Adeo work account — session memory). CI runs `terraform fmt -check` + `validate` on
  `infra/` (no creds); **no auto-apply / auto-deploy** (Workload Identity Federation is out of
  scope).
- **Rationale**: Faithful to the spike's proven flow; keeps CI hermetic; apply stays a deliberate
  operator action.
- **Alternatives**: GitHub Actions WIF deploy (deferred — extra IAM surface, out of scope).

### AD-7: In-image smoke + Terraform validation as the testable gates
- **Choice**: Since infra isn't unit-testable, the gates are: `docker buildx build --platform
  linux/amd64` succeeds and an in-image smoke (`claude --version`; `/generate` present; `python -m
  minion --help`) passes; `terraform fmt -check` + `validate` pass; a small `pytest` for the
  budget-killswitch function (Scheduler client mocked). AC-8 (real apply + run) is operator-run
  evidence.
- **Rationale**: Maximizes what's mechanically verifiable in CI without live GCP.

## Affected Files

### New Files
| File | Purpose |
|------|---------|
| `infra/versions.tf` | Terraform + google provider pins (mirror `infra/spike/versions.tf`). |
| `infra/variables.tf` | `project_id` (validated `veilleur-app`), `region` (`europe-west1`), `billing_account`, plugin pin. |
| `infra/apis.tf` | Enable only the **new** APIs (cloudscheduler, pubsub, cloudfunctions/cloudbuild, billingbudgets, eventarc), `disable_on_destroy=false`. |
| `infra/iam.tf` | `minion-sa` + per-secret accessor + project roles; `scheduler-invoker-sa` + `run.invoker`; function SA. |
| `infra/job.tf` | `google_cloud_run_v2_job "minion"` (SA, `max_retries=0`, `timeout=1200s`, image `ignore_changes`). |
| `infra/scheduler.tf` | `google_cloud_scheduler_job` (cron `0 6 * * *`, Europe/Paris, OIDC → Jobs `:run`). |
| `infra/killswitch.tf` | `google_billing_budget` + Pub/Sub topic + `google_cloudfunctions2_function` + its IAM. |
| `infra/outputs.tf` | Job name, scheduler job name, SA emails, AR URL. |
| `functions/budget-killswitch/main.py` | 2nd-gen Python function: parse budget event, pause the Scheduler job at ≥100 %. |
| `functions/budget-killswitch/requirements.txt` | `google-cloud-scheduler` (+ functions-framework). |
| `functions/budget-killswitch/test_killswitch.py` | Unit test: ≥100 % event → pause called; <100 % → no-op (client mocked). |
| `scripts/deploy-minion.sh` | Production build/push/bump (promoted from `spike-cloud.sh`). |
| `infra/RUNBOOK.md` | Apply → secrets → first deploy → Scheduler enable → smoke → OAuth re-auth → kill-switch ops. |

### Modified Files
| File | Change |
|------|--------|
| `minion/Dockerfile` | Entrypoint → `python -m minion`; install the pinned `/generate` plugin for the `minion` user (AD-2); keep amd64/non-root. |
| `infra/README.md` | Replace the "lands in F-007" note with the production layout + pointer to `RUNBOOK.md`; mark `spike/` deletion as F-013. |
| `.github/workflows/validate-specs.yml` | Add a `terraform fmt -check` + `validate` step for `infra/` (+ `functions/` pytest), hermetic (no creds). |

## Implementation Phases

### Phase 1: Production image + plugin (foundation)
- Promote `minion/Dockerfile` (entrypoint + plugin install, AD-1/AD-2).
- Add the build-time in-image smoke (claude + `/generate` + `minion --help`).
- Verify `docker buildx build --platform linux/amd64` succeeds locally.

### Phase 2: Terraform production root (the cloud stack)
- `versions.tf` / `variables.tf` / `apis.tf` (new APIs only).
- `iam.tf` (minion-sa, scheduler-invoker-sa, function SA — additive, least-privilege).
- `job.tf` (Cloud Run Job) + `scheduler.tf` (daily trigger).
- `killswitch.tf` + `functions/budget-killswitch/` (function + its unit test).
- `outputs.tf`. Gate: `terraform fmt -check` + `validate`.

### Phase 3: Deploy tooling, CI, runbook (operate)
- `scripts/deploy-minion.sh` (build/push/bump, bootstrap order, preconditions).
- `.github/workflows/validate-specs.yml` TF-validate + function pytest steps.
- `infra/README.md` + `infra/RUNBOOK.md`.
- **Operator-run (AC-8, outside CI):** apply → populate secrets → first image push → Job create →
  enable Scheduler → `gcloud run jobs execute minion` smoke → confirm `runs/{date}` + `articles/
  {date}` → observe first 06:00 run; record evidence in the track.

## Test Strategy
- **Mocking approach**: infra has no unit layer — gates are `terraform fmt -check` + `validate`
  (no creds) and `docker buildx build --platform linux/amd64` + an in-image smoke. The Python
  budget-killswitch function gets a `pytest` with the `google-cloud-scheduler` client mocked
  (matches the project's ports+fakes ethos).
- **Happy paths**: image builds and the smoke finds `claude`, `/generate`, and `minion`; `terraform
  validate` clean; a ≥100 % budget event triggers exactly one `scheduler.jobs.pause`.
- **Error scenarios**: <100 % event → function no-op; missing image on first apply → bootstrap
  order handles it; concurrent scheduler fire → Firestore lock aborts (existing F-003 behaviour).
- **Edge cases**: Scheduler OIDC audience/endpoint correctness (validate config shape); kill-switch
  re-enable is manual; `timeout=1200s` matches §2.6; APIs declared in `infra/` don't overlap the
  spike's (avoid double-management).

## Risk & Complexity
- **Estimated complexity**: **High** — multi-service cloud wiring, IAM, a budget→pubsub→function
  chain, operator-dependent apply, and the plugin-in-container unknown.
- **Key risks**:
  - **Plugin install in a headless image (AD-2)** — the biggest unknown; mitigated by the primary
    CLI mechanism + the clone fallback + a build-time smoke. Validate before relying on a cron run.
  - **Scheduler→Jobs OIDC** — endpoint/audience must be exact; verified by the first manual execute.
  - **State coexistence with the spike** — `infra/` must declare only non-overlapping resources/APIs
    or apply will fight the spike state; enforced by review + a clean `plan`.
  - **Budget API quirks** — billing budgets live on the billing account (not the project); needs the
    billing-account id and the right permissions; documented in the runbook.
  - **Operator dependency** — apply/secret/first-run steps need live creds and the correct personal
    GCP account (session memory: account flips to the Adeo work account); preconditions scripted.
- **New dependencies**: none in the Minion app; `functions/budget-killswitch/` adds
  `google-cloud-scheduler` + `functions-framework` (isolated to the function). Terraform `google`
  provider (already used by the spike).
