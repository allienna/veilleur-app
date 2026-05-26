# Spec: Hello-Veilleur spike

**Track ID**: 001-hello-veilleur-spike
**Roadmap ref**: F-001
**Status**: Complete
**Created**: 2026-05-19
**Branch**: feat/001-hello-veilleur-spike
**PRD sections**: §9 Phase 1 M2, §10 R1 (Claude OAuth in headless container), §10 R9 (first-time IAM chain), §5 Tech Stack, §8 Configuration
**Depends on**: none

## Context

Before investing 5+ days in the real Minion pipeline (F-003 through F-006), we need to prove the **integration chain** works end-to-end on Cloud Run. PRD §10 calls out two High/Medium risks that this spike de-risks in one shot:

- **R1 (High likelihood)**: Claude Code Max 5× via `CLAUDE_CODE_OAUTH_TOKEN` running headless inside a multi-stage Python+Node container is undocumented territory. If OAuth doesn't survive the container boundary, the entire cost model collapses (forcing the 30€/mo Anthropic API key fallback or worse, blocking the talk thesis).
- **R9 (Medium likelihood)**: First-time integration of Cloud Run Job + Firestore + Vertex AI + Gmail OAuth + Imagen + GitHub is a long IAM chain; any one of seven auth points (workload identity, secret manager access, scheduler invocation rights, Vertex `aiplatform.user`, Firestore `datastore.user`, GitHub fine-grained PAT scope, Gmail refresh-token validity) can block for hours-to-days.

The spike does **not** generate an article. It is a "Hello world" that touches every external system the real pipeline will use, so when F-003 starts we are debugging business logic, not credentials.

Per constitution §2 principle 2, `CLAUDE_CODE_OAUTH_TOKEN` is the default auth path; `ANTHROPIC_API_KEY` must remain absent from the container's env unless manually enabled.

## User Stories

- As the operator, I want a 10-line `gcloud run jobs execute` invocation to complete a Gmail-read → Imagen-call → Firestore-write → GitHub-commit cycle so that I know the auth chain is unblocked before F-003 begins.
- As the operator, I want to invoke the same container locally with the same secrets pulled from Secret Manager (via ADC) so that the dev↔prod parity is verified before any deployment automation lands.
- As the DevLille audience (indirectly), I want the spike's commit and Firestore record to look identical to what the real pipeline will produce so that the spike doubles as living documentation of the run shape.

## Functional Requirements

### FR-1: Multi-stage container image

A `minion/Dockerfile` builds a single image with:
- Python 3.12 (uv-managed venv at `/opt/venv`, project installed non-editable).
- Node 20 + `@anthropic-ai/claude-code` installed globally.
- `git` available on `PATH`.
- A non-root `minion` user (uid 1000, HOME `/home/minion`) — required because `claude -p
  --permission-mode bypassPermissions` refuses to run as root.
- Entrypoint: `python -m minion.spike` (CLI entry, see FR-2).

Image must run on `linux/amd64` (Cloud Run Job constraint) and build reproducibly locally (Apple Silicon → buildx cross-compile).

### FR-2: `python -m minion.spike` CLI entry

The CLI has two subcommands: `run` (the four-step chain, below) and `claude-probe` (the R1 gate, FR-3). The primary command `python -m minion.spike run --date YYYY-MM-DD` performs four steps **sequentially**, each gated by the previous succeeding:

1. **Gmail probe** — Fetch the count of unread messages from the dedicated Gmail inbox in the last 24h. Does **not** scrape content, does **not** call Jina. Pure auth probe.
2. **Imagen probe** — Generate one 16:9 placeholder image of *Le Veilleur* (navy owl, amber eyes, Pixar style) via `imagen-4.0-fast-generate-001` on Vertex AI. Image bytes held in memory.
3. **Firestore write** — Write a single document at `runs/spike-{YYYY-MM-DD}-{shortId}` containing `{started_at, ended_at, gmail_unread_count, imagen_status, image_bytes_size, github_commit_sha?}`.
   - **Observable-steps exemption (constitution §9)**: §9 mandates per-step `runs/{runId}/steps/{stepName}` Firestore docs. The spike deliberately writes only the top-level run doc plus one **structured stdout log line per step** (`step`, `status`, `duration_ms`) — enough to observe a probe run, without the steps subcollection. The full per-step Firestore state machine is F-003's deliverable (roadmap), not the spike's.
4. **GitHub probe** — Commit the placeholder image at `site/public/images/spikes/{YYYY-MM-DD}.webp` via the Contents API, using the fine-grained PAT scoped to the target repo. Capture the commit SHA back into the Firestore document.
   - **Migration-phase target (2026-05-26)**: writes to `allienna/veilleur-app` (this monorepo) to avoid polluting the live v1 site during v2 build-out. **Eventual target**: `allienna/veilleur` (served at the `allienna.github.io/veilleur` project-page URL — PRD §8 mislabeled it `allienna.github.io`, which doesn't exist). Switching back is a one-word `REPO_NAME` change in `github.py`.

The CLI prints a structured JSON line per step (`runId`, `step`, `status`, `duration_ms`) to stdout (Cloud Logging picks it up automatically). No `print()` outside the structured-log boundary (constitution §4).

### FR-3: Anthropic-OAuth headless probe

A separate `python -m minion.spike claude-probe` subcommand:

1. Reads `CLAUDE_CODE_OAUTH_TOKEN` from env (mounted from Secret Manager).
2. Invokes `claude -p --permission-mode bypassPermissions "Output the word PONG and nothing else."` as a subprocess from Python.
3. Asserts stdout starts with `PONG`. Exit 0 on success, non-zero on failure with the captured stderr.

`ANTHROPIC_API_KEY` MUST NOT be present in env when this probe runs (constitution §2 principle 2). The Dockerfile must not embed an API key. If `CLAUDE_CODE_OAUTH_TOKEN` is missing at runtime, fail fast with a clear message.

This is the load-bearing probe for risk R1. If it passes once in the deployed Cloud Run Job, R1 is closed.

### FR-4: Secret provisioning

Terraform (`infra/spike/main.tf`) creates five Secret Manager slots; `scripts/add-secret-versions.sh` walks the operator through populating the three active ones. Documented names:
- `gmail-oauth-refresh-token`
- `anthropic-oauth-token` (the `CLAUDE_CODE_OAUTH_TOKEN` value from `claude setup-token`)
- `github-pat-allienna-pages` (fine-grained PAT, scoped to `allienna/veilleur`, `contents:write` + `metadata:read`)
- A placeholder for `anthropic-api-key-fallback` — created but **never mounted** by default (constitution §2 principle 2).
- A placeholder for `vapid-private-key` — created but unused in F-001; provisioned now so PWA F-012 doesn't redo this work.

Provisioning is idempotent: `terraform apply` re-runs cleanly and `add-secret-versions.sh` is a no-op once populated. The human steps (`gcloud auth login`, `claude setup-token`, GitHub PAT creation UI) are documented in `minion/README.md` and surfaced by the script.

### FR-5: IAM bindings (Terraform)

Terraform binds the spike's service account (`spike-minion-sa@<project>.iam.gserviceaccount.com`) the minimum roles needed:
- `roles/secretmanager.secretAccessor` (scoped per-secret, not project-wide).
- `roles/aiplatform.user` (Vertex AI Imagen).
- `roles/datastore.user` (Firestore Native mode).
- `roles/run.invoker` is **not** needed yet — the spike is invoked manually via `gcloud run jobs execute`, not from a Scheduler. Scheduler bindings land in F-007.

Per-secret IAM bindings are mandatory (constitution §6).

### FR-6: Local↔Cloud Run parity

`./scripts/spike-local.sh` runs the container locally with ADC (`gcloud auth application-default login`) substituting for Workload Identity, against the **same** GCP project and **same** secrets the deployed Job uses. `./scripts/spike-cloud.sh` builds/pushes the image and bumps the Job; `gcloud run jobs execute` runs it. Both must produce equivalent Firestore documents (same shape, only `runId` and timestamps differ).

This parity is the deliverable that closes R9: a passing local run + a passing cloud run, against the same secrets, prove every IAM hop works.

## API Endpoints Involved

| System | Method | Path / Surface | Purpose |
|---|---|---|---|
| Gmail API | `users.messages.list` | `q=is:unread newer_than:1d`, label allowlist TBD | Probe — count only, no body fetch |
| Vertex AI Imagen | SDK call | `google-genai` SDK in `vertexai=True` mode, model `imagen-4.0-fast-generate-001` | Generate one 16:9 placeholder image |
| Firestore | `set` | `runs/spike-{date}-{shortId}` | Write run record |
| GitHub Contents API | `PUT` | `repos/allienna/veilleur/contents/site/public/images/spikes/{date}.webp` | Commit placeholder image |
| Anthropic Claude | CLI subprocess | `claude -p` with `CLAUDE_CODE_OAUTH_TOKEN` only | OAuth headless probe |

## Design References

N/A — F-001 is `minion` surface only. No UI, no user-facing component. Structured-log conventions follow `DESIGN.md` §3 (`minion` surface: JSON logs with `runId`, `step`, `level`).

## Error Scenarios

This is a spike. **Hard-fail-fast is preferred over graceful degradation** — the point is to surface auth/IAM failures clearly, not to mask them. Reference PRD §6 only for the eventual real pipeline; for F-001:

| Failure | Behavior |
|---|---|
| Missing `CLAUDE_CODE_OAUTH_TOKEN` at runtime | Exit non-zero before the Claude probe runs; print which secret is missing. |
| `ANTHROPIC_API_KEY` present in env | Exit non-zero with explicit message — violates constitution §2 principle 2. Refuse to proceed. |
| Gmail OAuth refresh-token expired/revoked | Exit non-zero; print the re-auth runbook URL placeholder. |
| Vertex AI moderation rejects the placeholder mascot prompt | Retry **once** with the same prompt; on second failure, mark `imagen_status: "blocked"` in Firestore, continue to step 3 → 4 (this is the R2 mitigation rehearsal). |
| Vertex AI quota / region unavailable | Exit non-zero. |
| Firestore write fails | Exit non-zero; do not proceed to GitHub step. |
| GitHub commit fails (HTTP 4xx/5xx) | Exit non-zero with the response body. No retries in the spike. |
| Container build fails on Apple Silicon | Document the `--platform linux/amd64` flag in the Dockerfile + README. |
| Local run works but cloud run fails | The R9 close-out criterion has not been met; the spike is incomplete until both pass. |

## Acceptance Criteria

- [x] AC-1: `docker build --platform linux/amd64 minion/` succeeds reproducibly from a clean clone on Apple Silicon.
- [x] AC-2: `./scripts/spike-local.sh` completes the four-step run end-to-end against the real GCP project, producing one Firestore document at `runs/spike-{date}-{shortId}` with all fields populated.
- [x] AC-3: `./scripts/spike-cloud.sh` + `gcloud run jobs execute` runs the Job in Cloud Run and produces an equivalently-shaped Firestore document.
- [x] AC-4: A commit appears on `allienna/veilleur-app` (migration-phase target) at `site/public/images/spikes/{date}.webp` from both the local and cloud invocations, with the SHA captured in Firestore.
- [x] AC-5: `python -m minion.spike claude-probe` exits 0 inside the deployed container, with `ANTHROPIC_API_KEY` confirmed absent from env. **This is the R1 close-out gate.**
- [x] AC-6: No `print()` outside the structured-log boundary in committed code; only JSON lines on stdout (per constitution §4).
- [x] AC-7: `terraform apply` in `infra/spike/` is idempotent: a re-run after a clean apply shows "No changes". `scripts/add-secret-versions.sh` is a no-op once all 3 secrets are populated.
- [x] AC-8: Terraform grants `spike-minion-sa` `roles/aiplatform.user` + `roles/datastore.user` at the project level and `roles/secretmanager.secretAccessor` per-secret on the 3 active secrets — no project-wide `secretmanager.secretAccessor`.
- [x] AC-9: README section in `minion/README.md` documents the human prerequisites (`gcloud auth login`, `claude setup-token`, GitHub PAT creation) and the order to run scripts.
- [x] AC-10: Total spike-run duration on Cloud Run is under 5 minutes (well below the 20-min constitution cap, since no Claude generation is in scope).

## Out of Scope

- **No** Jina Reader integration — F-004 brings it in.
- **No** `/generate` slash command invocation — only the trivial `PONG` probe. F-005 brings real generation.
- **No** Cloud Scheduler. The spike is invoked manually. F-007 wires Scheduler + budget kill-switch.
- **No** PWA, no Firebase Hosting, no Auth, no `trigger-api`.
- **Terraform from F-001** (AD-7, revised 2026-05-21): `infra/spike/` is local-state Terraform covering APIs, secret slots, SA, IAM, Firestore DB, Artifact Registry, and the Cloud Run Job shape. F-007 extends it (Scheduler + kill-switch) and migrates to GCS-backed state. Image build/push + Job image-revision bumps stay in bash (`scripts/spike-cloud.sh`).
- **No** monorepo workspaces yet (pwa/, trigger-api/, shared/). Only `minion/` directory + top-level `scripts/`. The full scaffold is F-002.
- **No** unit tests for the spike code paths. The acceptance gate is the end-to-end run, not coverage. Real tests start in F-003.
- **No** CI workflows for the spike. The deliverable is a working local + cloud run, not pipeline automation.
- **No** removal/cleanup of the spike code in F-001 itself — F-002 absorbs or deletes it.

## Open Questions

> Resolved 2026-05-19 during `/plan`. See `plan.md` for impact.

- **OQ-1 → Resolved**: Host on the **prod `veilleur-app`** GCP project directly. Cleanup of failed-spike artifacts is explicit.
- **OQ-2 → Resolved**: Cloud Run region **`europe-west1`** (Belgium).
- **OQ-3 → Resolved**: GitHub PAT issued + populated via `scripts/add-secret-versions.sh`. NOTE (2026-05-22): the PAT must be scoped to `allienna/veilleur`, NOT `allienna.github.io` (which doesn't exist — PRD §8 error). First issuance was mis-scoped and is being re-issued.
- **OQ-4 → Resolved**: Keep `spike.py` indefinitely at `minion/src/minion/spike.py` as a regression probe.
- **OQ-5 → Resolved**: **1.5-day hard timebox**. If AC-5 (R1 close-out) not green by EOD +1.5, escalate before proceeding — accept Anthropic API-key fallback (constitution §2 deviation, requires PR), descope F-005's agentic step, or further M7 slip. Decision logged in `escalation.md` if triggered.
