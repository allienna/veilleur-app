output "cloud_run_job_name" {
  description = "Name of the production Cloud Run Job (the Minion)."
  value       = google_cloud_run_v2_job.minion.name
}

output "scheduler_job_name" {
  description = "Name of the daily Cloud Scheduler job."
  value       = google_cloud_scheduler_job.minion_daily.name
}

output "minion_sa_email" {
  description = "Runtime service account the Job executes as."
  value       = google_service_account.minion.email
}

output "scheduler_invoker_sa_email" {
  description = "Service account Cloud Scheduler uses to invoke the Job (run.invoker only)."
  value       = google_service_account.scheduler_invoker.email
}

output "artifact_registry_url" {
  description = "Base URL for the Minion image (append /minion:<tag>). The repo is owned by the spike state."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/minion"
}
