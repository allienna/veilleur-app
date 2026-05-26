variable "project_id" {
  description = "GCP project hosting the Veilleur spike. Spec OQ-1 resolved to 'veilleur-app'."
  type        = string
  default     = "veilleur-app"

  validation {
    condition     = var.project_id == "veilleur-app"
    error_message = "Spec OQ-1 resolved project to 'veilleur-app'. Update spec.md before overriding."
  }
}

variable "region" {
  description = "GCP region for regional resources (Cloud Run, Artifact Registry). Spec OQ-2 resolved to 'europe-west1'."
  type        = string
  default     = "europe-west1"
}
