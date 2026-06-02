# Daily autonomous trigger (FR-A1 / FR-4): fire the Minion Job at 06:00 Europe/Paris. The job is
# invoked via a POST to the Cloud Run Jobs `:run` endpoint authenticated with an OAuth access token
# (the right mechanism for a googleapis.com REST call — `oauth_token`, not OIDC), minted for the
# dedicated scheduler-invoker SA (run.invoker only — binding in job.tf). The Job's own Firestore
# lock (F-003) prevents overlap if a run is still in flight.
resource "google_cloud_scheduler_job" "minion_daily" {
  name      = "minion-daily"
  region    = var.region
  schedule  = "0 6 * * *"
  time_zone = "Europe/Paris"

  attempt_deadline = "320s" # time to get the Job *accepted* (the run itself is async, ≤20 min)

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.minion.name}:run"

    oauth_token {
      service_account_email = google_service_account.scheduler_invoker.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [
    google_project_service.new,
    google_cloud_run_v2_job_iam_member.scheduler_invoker,
  ]
}
