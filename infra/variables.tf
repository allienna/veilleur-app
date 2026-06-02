# Production infra variables (F-007). The shared singletons (Firestore default DB, the Artifact
# Registry `minion` repo, the 5 secret slots, and their APIs) are owned by infra/spike/ state and
# are NOT re-declared here (plan AD-2 / Open Q#2) — this root adds only the production-new resources.

variable "project_id" {
  description = "GCP project hosting Veilleur. Pinned to 'veilleur-app' (spec OQ-1)."
  type        = string
  default     = "veilleur-app"

  validation {
    condition     = var.project_id == "veilleur-app"
    error_message = "Project is pinned to 'veilleur-app'. Update the spec before overriding."
  }
}

variable "region" {
  description = "GCP region for regional resources (Cloud Run, Scheduler, Functions). europe-west1, co-located with the spike's Firestore + Artifact Registry."
  type        = string
  default     = "europe-west1"
}

variable "billing_account" {
  description = "Billing account ID (XXXXXX-XXXXXX-XXXXXX) the budget kill-switch is created on. No default — supply via tfvars/CLI."
  type        = string
}

variable "budget_amount_eur" {
  description = "Monthly budget cap in EUR for the kill-switch (constitution §2.10 / §10 R7)."
  type        = number
  default     = 30
}

variable "image_tag" {
  description = "Initial Cloud Run Job image tag. The deploy script bumps the live image out-of-band (image is under ignore_changes)."
  type        = string
  default     = "latest"
}
