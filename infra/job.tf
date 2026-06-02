# The production Cloud Run Job (the Minion). TF owns the Job *shape*; the image tag is bumped
# out-of-band by scripts/deploy-minion.sh (`gcloud run jobs update --image`), so `image` and the
# client-metadata fields are under ignore_changes (spike pattern). timeout=1200s is the
# constitution §2.6 20-minute hard cap; max_retries=0 (a failed run is not auto-retried — replay
# is a deliberate manual/scheduled action).
resource "google_cloud_run_v2_job" "minion" {
  name     = "minion"
  location = var.region

  template {
    template {
      service_account = google_service_account.minion.email
      max_retries     = 0
      timeout         = "1200s"

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/minion/minion:${var.image_tag}"
        args  = ["run"]
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.minion_accessor,
    google_project_iam_member.minion_roles,
  ]
}

# Cloud Scheduler invokes the Job through this binding — the invoker SA holds run.invoker on the
# Job and nothing else (plan AD-4, least-privilege trigger path).
resource "google_cloud_run_v2_job_iam_member" "scheduler_invoker" {
  name     = google_cloud_run_v2_job.minion.name
  location = google_cloud_run_v2_job.minion.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}
