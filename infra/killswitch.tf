# Budget kill-switch (constitution §2.10 / §10 R7): a 30 EUR/mo budget publishes threshold events
# to Pub/Sub; a 2nd-gen Python function pauses the daily Scheduler job at 100%. Pause-only is
# reversible and cheap (plan AD-5). Re-enabling the Scheduler is a manual action; DISABLING THIS
# KILL-SWITCH REQUIRES A PR (constitution §2.10).

# ─── Pub/Sub topic the budget notifies ───────────────────────────────────────────────────
resource "google_pubsub_topic" "budget" {
  name       = "budget-killswitch"
  depends_on = [google_project_service.new]
}

# ─── Billing budget (lives on the billing account, not the project) ───────────────────────
resource "google_billing_budget" "monthly_cap" {
  billing_account = var.billing_account
  display_name    = "Veilleur ${var.budget_amount_eur} EUR/mo cap"

  budget_filter {
    projects = ["projects/${var.project_id}"]
  }

  amount {
    specified_amount {
      currency_code = "EUR"
      units         = var.budget_amount_eur
    }
  }

  threshold_rules {
    threshold_percent = 0.8 # warn
  }
  threshold_rules {
    threshold_percent = 1.0 # kill
  }

  all_updates_rule {
    pubsub_topic   = google_pubsub_topic.budget.id
    schema_version = "1.0"
  }

  depends_on = [google_project_service.new]
}

# ─── Function source: zip the dir, upload to a GCS bucket ─────────────────────────────────
data "archive_file" "killswitch" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/budget-killswitch"
  output_path = "${path.module}/.build/budget-killswitch.zip"
  excludes    = ["test_killswitch.py", "__pycache__"]
}

resource "google_storage_bucket" "functions" {
  name                        = "${var.project_id}-functions-src"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
  depends_on                  = [google_project_service.new]
}

resource "google_storage_bucket_object" "killswitch" {
  name   = "budget-killswitch-${data.archive_file.killswitch.output_md5}.zip"
  bucket = google_storage_bucket.functions.name
  source = data.archive_file.killswitch.output_path
}

# ─── The 2nd-gen function ─────────────────────────────────────────────────────────────────
resource "google_cloudfunctions2_function" "killswitch" {
  name     = "budget-killswitch"
  location = var.region

  build_config {
    runtime     = "python312"
    entry_point = "on_budget_event"
    source {
      storage_source {
        bucket = google_storage_bucket.functions.name
        object = google_storage_bucket_object.killswitch.name
      }
    }
  }

  service_config {
    max_instance_count    = 1
    available_memory      = "256Mi"
    timeout_seconds       = 60
    service_account_email = google_service_account.killswitch.email
    environment_variables = {
      PROJECT_ID    = var.project_id
      REGION        = var.region
      SCHEDULER_JOB = google_cloud_scheduler_job.minion_daily.name
    }
  }

  event_trigger {
    trigger_region        = var.region
    event_type            = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic          = google_pubsub_topic.budget.id
    service_account_email = google_service_account.killswitch.email
    retry_policy          = "RETRY_POLICY_RETRY"
  }

  depends_on = [
    google_project_service.new,
    google_project_iam_member.killswitch_scheduler_admin,
  ]
}
