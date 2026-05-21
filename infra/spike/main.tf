locals {
  # APIs the spike needs enabled. `secretmanager` was enabled manually during T-2.1's
  # investigation — re-declaring it here is idempotent and brings it under TF management.
  apis = [
    "secretmanager.googleapis.com",
    "aiplatform.googleapis.com",
    "firestore.googleapis.com",
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
