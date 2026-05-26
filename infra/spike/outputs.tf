output "service_account_email" {
  description = "Email of the Cloud Run Job's runtime service account."
  value       = google_service_account.spike_minion_sa.email
}

output "artifact_registry_url" {
  description = "Base URL for pushing the Minion image (append /spike:<tag>)."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.minion.repository_id}"
}
