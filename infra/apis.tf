# Enable only the APIs the spike state does NOT already manage (plan AD-2 / Open Q#2). The spike
# (infra/spike/main.tf) owns: run, aiplatform, firestore, secretmanager, artifactregistry, gmail,
# iam. F-007 adds the Scheduler + budget-kill-switch chain. disable_on_destroy=false avoids the
# re-enablement propagation lag on re-apply (spike pattern).
locals {
  new_apis = [
    "cloudscheduler.googleapis.com", # FR-4 daily trigger
    "pubsub.googleapis.com",         # FR-5 budget event transport
    "cloudfunctions.googleapis.com", # FR-5 kill-switch function (2nd gen)
    "cloudbuild.googleapis.com",     # 2nd-gen function source build
    "eventarc.googleapis.com",       # 2nd-gen function Pub/Sub trigger
    "billingbudgets.googleapis.com", # FR-5 budget
  ]
}

resource "google_project_service" "new" {
  for_each = toset(local.new_apis)

  service                    = each.key
  disable_on_destroy         = false
  disable_dependent_services = false
}
