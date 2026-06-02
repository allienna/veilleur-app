# trigger-api Cloud Run service (F-008): the authenticated manual-trigger endpoint. It verifies a
# Firebase JWT in-app (the real boundary, constitution §2.1) and invokes the `minion` Job. Like the
# rest of this root it is additive; deploy is operator-run (RUNBOOK).

# ─── Runtime SA: only run.invoker on the minion Job ──────────────────────────────────────
resource "google_service_account" "trigger_api" {
  account_id   = "trigger-api-sa"
  display_name = "trigger-api Cloud Run service SA"
}

resource "google_cloud_run_v2_job_iam_member" "trigger_api_invoker" {
  name     = google_cloud_run_v2_job.minion.name
  location = google_cloud_run_v2_job.minion.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.trigger_api.email}"
}

# ─── The service ─────────────────────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "trigger_api" {
  name     = "trigger-api"
  location = var.region

  template {
    service_account = google_service_account.trigger_api.email
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/minion/trigger-api:${var.image_tag}"
      ports {
        container_port = 8080
      }
      env {
        name  = "PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "REGION"
        value = var.region
      }
      env {
        name  = "JOB"
        value = google_cloud_run_v2_job.minion.name
      }
    }
  }

  # The deploy script bumps the image out-of-band; don't let it show as TF drift.
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_cloud_run_v2_job_iam_member.trigger_api_invoker]
}

# Public *ingress* so the browser/PWA can reach it. This is NOT a security hole: the real boundary
# is the in-app Firebase JWT + allowed-email check (FR-2, constitution §2.1 — "gate the action, not
# the bundle"). A browser cannot present a Cloud Run IAM token, so app-layer auth is the gate.
resource "google_cloud_run_v2_service_iam_member" "trigger_api_public" {
  name     = google_cloud_run_v2_service.trigger_api.name
  location = google_cloud_run_v2_service.trigger_api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "trigger_api_url" {
  description = "Public HTTPS URL of the trigger-api service (auth enforced in-app)."
  value       = google_cloud_run_v2_service.trigger_api.uri
}
