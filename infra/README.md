# infra/

Infrastructure-as-code for Veilleur-app.

- `spike/` — F-001 throwaway plumbing (GCP project, Secret Manager, spike Cloud Run Job IAM). Slated for deletion once the real pipeline lands; **do not extend**.
- Production IaC (Cloud Run Job, Cloud Scheduler, service accounts, IAM bindings, Firestore + Vertex enablement, budget kill-switch) lands in **F-007** at the top level here — Terraform preferred, gcloud scripts acceptable (constitution §3).
