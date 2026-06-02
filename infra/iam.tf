# Service accounts + IAM for the production pipeline (plan AD-3/AD-4/AD-5). All bindings are
# additive — they reference the spike-created secrets by ID and never grant project-wide secret
# access (constitution §6 least-privilege).

# ─── Runtime SA: the identity the Cloud Run Job executes as ───────────────────────────────
resource "google_service_account" "minion" {
  account_id   = "minion-sa"
  display_name = "Veilleur Minion runtime SA (production)"
}

# Per-secret accessor on the 3 secrets the Minion reads at runtime (gmail / anthropic-oauth /
# github-pat). vapid-private-key is added in F-012; anthropic-api-key-fallback is never granted
# by default (constitution §2.2). The secret slots themselves are owned by the spike state.
locals {
  minion_runtime_secrets = [
    "gmail-oauth-refresh-token",
    "anthropic-oauth-token",
    "github-pat-allienna-pages",
  ]
}

resource "google_secret_manager_secret_iam_member" "minion_accessor" {
  for_each = toset(local.minion_runtime_secrets)

  # Fully-qualified resource name (not the short id) so the binding can't accidentally resolve
  # against a different project if provider config changes.
  secret_id = "projects/${var.project_id}/secrets/${each.key}"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.minion.email}"
}

# Project roles: Vertex AI (Imagen) + Firestore (Datastore mode API), no keys.
resource "google_project_iam_member" "minion_roles" {
  for_each = toset([
    "roles/aiplatform.user",
    "roles/datastore.user",
  ])

  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.minion.email}"
}

# ─── Scheduler invoker SA: only run.invoker on the Job (binding lives in job.tf) ──────────
resource "google_service_account" "scheduler_invoker" {
  account_id   = "scheduler-invoker-sa"
  display_name = "Cloud Scheduler → Minion Job invoker"
}

# ─── Kill-switch function SA: pause the Scheduler on a 100% budget event ──────────────────
resource "google_service_account" "killswitch" {
  account_id   = "budget-killswitch-sa"
  display_name = "Budget kill-switch function SA"
}

# Scoped to Scheduler admin so the function can pause/resume the daily job (FR-5). Project-level
# is the tightest the Scheduler IAM surface supports for a pause action.
resource "google_project_iam_member" "killswitch_scheduler_admin" {
  project = var.project_id
  role    = "roles/cloudscheduler.admin"
  member  = "serviceAccount:${google_service_account.killswitch.email}"
}
