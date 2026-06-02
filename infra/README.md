# infra/

Infrastructure-as-code for Veilleur-app.

## Production root (`infra/*.tf`) — F-007

The production stack (Terraform, `europe-west1`). Operate it with [`RUNBOOK.md`](RUNBOOK.md).

| File | Resources |
|------|-----------|
| `versions.tf` / `variables.tf` | Provider pins; `project_id`, `region`, `billing_account`, `budget_amount_eur`, `image_tag`. |
| `apis.tf` | Enables only the **new** APIs (scheduler, pubsub, cloud functions/build, eventarc, billing budgets). |
| `iam.tf` | Runtime `minion-sa` (per-secret accessor + `aiplatform.user`/`datastore.user`), `scheduler-invoker-sa`, `budget-killswitch-sa`. |
| `job.tf` | Cloud Run Job `minion` (`timeout=1200s`, `max_retries=0`, image under `ignore_changes`) + `run.invoker` for the scheduler SA. |
| `scheduler.tf` | Cloud Scheduler `minion-daily` — `0 6 * * *` Europe/Paris, OIDC/OAuth → Jobs `:run`. |
| `killswitch.tf` | 30 EUR/mo budget → Pub/Sub → 2nd-gen function that pauses the Scheduler at 100% (constitution §2.10). |
| `outputs.tf` | Job/scheduler names, SA emails, Artifact Registry URL. |

### State boundary with the spike (important)

This root **adds only production-new resources**. The shared singletons — the Firestore default
database, the Artifact Registry `minion` repo, the 5 Secret Manager slots, and the APIs the spike
enabled — remain owned by `infra/spike/` state (plan AD-2). The production root references them
(by ID / URL) but does not manage them. Consolidating both states into one root is deferred to
**F-013** (when `spike/` is deleted).

## `spike/` — F-001 throwaway

Hello-Veilleur plumbing (GCP project, Secret Manager slots, spike Cloud Run Job). **Do not extend.**
Slated for deletion in F-013, at which point its singletons are consolidated into the production root.
