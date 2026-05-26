locals {
  # APIs the spike needs enabled. `secretmanager` was enabled manually during T-2.1's
  # investigation — re-declaring it here is idempotent and brings it under TF management.
  apis = [
    "secretmanager.googleapis.com",
    "aiplatform.googleapis.com",
    "firestore.googleapis.com",
    "gmail.googleapis.com",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
  ]

  # The 5 Secret Manager slots F-001 provisions. The 3 actively used by the spike
  # (gmail / anthropic / github-pat) are populated via scripts/add-secret-versions.sh (T-4.1a).
  # The 2 others are slots only — populated by later features that need them
  # (vapid-private-key in F-012; anthropic-api-key-fallback never by default per
  # constitution §2 principle 2).
  secret_ids = [
    "gmail-oauth-refresh-token",
    "anthropic-oauth-token",
    "github-pat-allienna-pages",
    "anthropic-api-key-fallback",
    "vapid-private-key",
  ]

  # Subset the spike actually reads at runtime. Each gets a per-secret accessor binding for
  # the SA — never a project-wide secretmanager grant (constitution §6).
  active_secret_ids = [
    "gmail-oauth-refresh-token",
    "anthropic-oauth-token",
    "github-pat-allienna-pages",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.apis)

  service = each.key

  # Don't yank APIs on `terraform destroy` — other resources outside this module may rely
  # on them, and re-enablement has a propagation lag that's painful on re-apply.
  disable_on_destroy         = false
  disable_dependent_services = false
}

resource "google_secret_manager_secret" "spike" {
  for_each = toset(local.secret_ids)

  secret_id = each.key

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# ─── Service account the Cloud Run Job runs as (Workload Identity, AD-5) ─────────────────
resource "google_service_account" "spike_minion_sa" {
  account_id   = "spike-minion-sa"
  display_name = "Veilleur spike Minion SA"

  depends_on = [google_project_service.apis]
}

# Per-secret accessor bindings — only the 3 secrets the spike reads, never project-wide.
resource "google_secret_manager_secret_iam_member" "spike_sa_accessor" {
  for_each = toset(local.active_secret_ids)

  secret_id = google_secret_manager_secret.spike[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.spike_minion_sa.email}"
}

# Project-level roles the SA needs: Vertex AI (Imagen) and Firestore (Datastore mode API).
resource "google_project_iam_member" "spike_sa_roles" {
  for_each = toset([
    "roles/aiplatform.user",
    "roles/datastore.user",
  ])

  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.spike_minion_sa.email}"
}

# ─── Firestore (default) database — Native mode, single-region for cost/locality ────────
# Missed in the initial T-4.1/T-4.2 pass: the API being enabled does not create a database.
# Single-region europe-west1 (cheaper than the eur3 multi-region; co-located with Cloud Run).
# Location is permanent once set.
resource "google_firestore_database" "default" {
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.apis]
}

# ─── Artifact Registry repo for the Minion container image ───────────────────────────────
resource "google_artifact_registry_repository" "minion" {
  location      = var.region
  repository_id = "minion"
  format        = "DOCKER"
  description   = "Veilleur Minion container images"

  depends_on = [google_project_service.apis]
}

# ─── Cloud Run Job (the Minion) ──────────────────────────────────────────────────────────
# TF owns the Job *shape*; the image tag is bumped out-of-band by scripts/spike-cloud.sh
# (`gcloud run jobs update --image=...`), so `image` is under ignore_changes. The initial
# image is the `:latest` tag, which spike-cloud.sh must push before the first apply.
# No Scheduler binding yet — the spike is invoked manually (Scheduler lands in F-007).
resource "google_cloud_run_v2_job" "spike_minion" {
  name     = "spike-minion"
  location = var.region

  template {
    template {
      service_account = google_service_account.spike_minion_sa.email
      max_retries     = 0
      timeout         = "1200s" # 20-min hard cap, constitution §2 principle 6

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/minion/spike:latest"
        args  = ["run"]
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      # `gcloud run jobs update` (spike-cloud.sh) stamps these client-metadata fields;
      # ignore them so out-of-band image bumps don't show as TF drift.
      client,
      client_version,
    ]
  }

  depends_on = [
    google_artifact_registry_repository.minion,
    google_project_iam_member.spike_sa_roles,
    google_secret_manager_secret_iam_member.spike_sa_accessor,
  ]
}
