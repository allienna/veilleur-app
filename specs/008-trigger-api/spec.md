# Spec: trigger-api micro-service

**Track ID**: 008-trigger-api
**Roadmap ref**: F-008
**Status**: In Progress
**Created**: 2026-06-02
**Branch**: feat/008-trigger-api
**PRD sections**: FR-E1 (manual trigger, server-side), FR-F1 (mono-tenant auth, layer 2), FR-A1 (manual trigger produces an identical run shape), §5 (trigger-api Cloud Run service), §7 Security (defense-in-depth), constitution §2.1 (single allowed identity) + §6 (least-privilege IAM)
**Depends on**: F-007 — Cloud Run + Scheduler (**merged** #11; provides the `minion` Job to invoke, the `infra/` Terraform root, and Firestore). Builds on the F-002 `trigger-api` skeleton (the `@veilleur/trigger-api` workspace, the stubbed `POST /trigger`, and the `ALLOWED_OPERATOR_EMAIL` pin).

## Context

The Minion already runs daily via Cloud Scheduler (F-007). F-008 adds the **manual** trigger path:
a tiny Cloud Run **service** that lets the operator fire a run on demand — the essential capability
for the live demo and for recovering a missed day. It is **layer 2 of the defense-in-depth auth**
(PRD FR-F1): it verifies the caller's Firebase Auth JWT and asserts the single allowed operator
email server-side, then invokes the Cloud Run Job and returns a run identifier.

Today `trigger-api/src/index.ts` is a skeleton that returns `501 not_implemented` for
`POST /trigger`, and `auth.ts` holds only the `ALLOWED_OPERATOR_EMAIL` pin (constitution §2.1, kept
byte-identical across `firestore.rules` / `trigger-api/src/auth.ts` / `pwa/src/config.ts`). F-008
fills both in, containerises the service, and adds its Cloud Run deployment to `infra/`.

The PWA is the eventual caller (F-011 wires the "Run now" button), but per the roadmap F-008 is
provable first with **curl + Postman** using a real Firebase JWT — no PWA needed to ship it.

**Nature of this track.** Like F-007, the in-repo deliverables (service code, Dockerfile, Terraform,
tests, CI) are reviewable and CI-checkable; the actual **deploy** (`terraform apply`, building/
pushing the image, and the live JWT smoke) is **operator-run** with GCP credentials.

## User Stories

- As the **operator**, I want a "Run now" capability behind an authenticated endpoint so I can
  trigger a pipeline run on demand (live demo + recovery), without a laptop or `gcloud`.
- As the **operator**, I want the endpoint to reject anyone who is not my single allowed,
  email-verified Google identity — even if they discover the URL — so run state and triggering stay
  private (constitution §2.1, PRD FR-F1).
- As the **operator**, I want a manual trigger to produce an **identical run shape** to a
  scheduler-fired run (same Firestore documents, same outputs) so supervision and history are
  uniform (FR-A1).
- As the **operator**, I want the response to carry a run identifier so the PWA (F-011) can navigate
  straight to the live supervision view.
- As a **developer**, I want the JWT verification and Job-invocation logic behind small, unit-tested
  functions (auth check, invoker) with the external SDKs injected, so the service tests hermetically
  in CI without Firebase or GCP.

## Functional Requirements

### FR-1: `POST /trigger` — authenticated manual trigger
Implement the single endpoint. It expects an `Authorization: Bearer <Firebase ID token>` header.
Flow: verify the JWT → assert claims → invoke the `minion` Cloud Run Job → respond `202 Accepted`
with a run identifier (shape — Open Questions). No other routes; everything else is `404`. The
service is stateless and holds no secrets in source (constitution §3 — identity via the runtime SA).

### FR-2: Firebase JWT verification + allowed-email assertion (PRD FR-F1, constitution §2.1)
Verify the bearer token is a valid, unexpired Firebase Auth ID token for the project, then assert
**`token.email === ALLOWED_OPERATOR_EMAIL && token.email_verified === true`**. Any failure —
missing/malformed header, invalid/expired signature, wrong audience/issuer, non-allowed email, or
`email_verified !== true` — returns **401** (or 403 for a validly-authenticated but non-allowed
identity — Open Questions) with a minimal error body and **no run invoked**. The `ALLOWED_OPERATOR_EMAIL`
constant stays byte-identical with the other two pins (`scripts/check-allowed-email.sh`).

### FR-3: Invoke the Cloud Run Job
On a valid, allowed request, invoke the `minion` Cloud Run Job (F-007) in `europe-west1` via the
Cloud Run Admin API `jobs:run`, authenticated by the service's runtime SA (mechanism — Open
Questions: `google-auth-library` access token vs a typed client). The invocation must yield the
**same run shape** as the scheduler path (the Job is the single entry point, so this holds by
construction). Optionally pass a target `--date` for recovery/replay (Open Questions).

### FR-4: Run-identifier response contract
Define what `POST /trigger` returns so the PWA can navigate to the live view (FR-E1). The Minion
keys runs by **date** and mints its own per-attempt `runId` internally (F-003), so the trigger
cannot know the eventual `runId` up front. Pin the contract (Open Questions) — recommended:
`202 { date, execution }` where `date` is today (Europe/Paris) and `execution` is the Cloud Run Job
execution name; the PWA watches `runs/{date}`.

### FR-5: Least-privilege runtime identity (constitution §6)
The service runs as its own service account holding **only** `roles/run.invoker` on the `minion`
Job (nothing else). No project-wide grants. Declared in `infra/` alongside the service.

### FR-6: Containerisation + Cloud Run service deployment
A `trigger-api/Dockerfile` (Node 20 slim, builds the TS, runs `node dist/index.js`, listens on
`$PORT`). A Cloud Run **service** added to the `infra/` Terraform root (its SA + the `run.invoker`
binding on the Job + the service itself), plus a deploy script. Consistent with F-007: CI validates;
`terraform apply` + image push + the live smoke are operator-run (RUNBOOK addition).

### FR-7: Hermetic testability
The JWT-verification and Job-invocation dependencies sit behind small injected seams (a
`verifyToken` port and a `runJob` port) with fakes, so the request handler is unit-tested in CI with
no Firebase, no GCP, no network. Tests cover: allowed happy path → invokes + 202; each rejection
path → 401/403 + no invocation; malformed/missing header; non-allowed email; `email_verified=false`.

### FR-8: Operational hardening (minimal)
HTTPS-only is provided by Cloud Run. The endpoint does no rate-limiting beyond the auth gate (single
user). Structured logs (no secrets, no tokens in logs). A `GET /healthz` (or `/`) returns `200` for
Cloud Run health checks (Open Questions — whether to add it).

## API Endpoints (this service)

| Method | Path | Auth | Purpose | Success | Failure |
|--------|------|------|---------|---------|---------|
| POST | `/trigger` | Firebase JWT (allowed email) | Invoke the `minion` Job | `202 { date, execution }` (FR-4) | `401`/`403` (auth), `405` (wrong method), `500` (invoke error) |
| GET | `/healthz` | none | Liveness (Open Q) | `200` | — |

### Upstream interfaces it calls

| System | Interface | Auth |
|--------|-----------|------|
| Firebase Auth | verify ID token (`firebase-admin` `verifyIdToken`, or JWKS verify) | project public keys |
| Cloud Run Admin API | `jobs.run` on `minion` (`europe-west1`) | service SA, `run.invoker` |

## Error Scenarios

| Scenario | Handling |
|----------|----------|
| Missing/malformed `Authorization` header | `401`, no invocation. |
| Invalid / expired / wrong-audience JWT | `401`, no invocation. |
| Valid JWT but `email !== ALLOWED` or `email_verified !== true` | `403` (authenticated, not authorized), no invocation. |
| Wrong method / unknown path | `405` / `404`. |
| Cloud Run `jobs.run` fails (5xx / quota / IAM) | `500` with a generic message; details logged, not returned. |
| A run is already in progress | The Job's Firestore lock aborts the second run `already_running` (F-003) — the trigger still returns `202`; the run doc reflects the abort. (A pre-check is **out of scope** — Open Questions.) |
| Token/PII in logs | Never logged (FR-8). |

## Acceptance Criteria

- [ ] AC-1: `POST /trigger` with a valid, allowed, email-verified Firebase JWT invokes the `minion`
      Job and returns `202` with the run-identifier contract (asserted via the injected `runJob`
      fake — no GCP in CI).
- [ ] AC-2: a request with no/!malformed bearer token returns `401` and invokes nothing.
- [ ] AC-3: a validly-signed JWT whose `email !== ALLOWED_OPERATOR_EMAIL` returns `403` and invokes
      nothing; likewise `email_verified === false`.
- [ ] AC-4: unknown path → `404`, wrong method on `/trigger` → `405`; neither invokes the Job.
- [ ] AC-5: a `jobs.run` failure surfaces as `500` with no internal detail leaked; the error is
      logged (no token/PII).
- [ ] AC-6: `ALLOWED_OPERATOR_EMAIL` is byte-identical across the three pins (`pnpm check:email`
      green), and `pnpm lint` + `pnpm typecheck` pass for `@veilleur/trigger-api` (strict, no `any`).
- [ ] AC-7: the handler + auth + invoker are unit-tested with fakes (no Firebase/GCP/network); the
      test command runs in CI.
- [ ] AC-8: `trigger-api/Dockerfile` builds and serves `POST /trigger` on `$PORT`; the Cloud Run
      service + its SA + `run.invoker` binding are declared in `infra/` and `terraform validate`
      passes.
- [ ] AC-9 (**operational, operator-run, out-of-CI**): deployed to Cloud Run, a real `curl` with a
      valid operator Firebase JWT triggers a run that writes `runs/{date}` identical in shape to a
      scheduler run; a non-allowed token is rejected. Evidence recorded in the track.

## Out of Scope

- **PWA "Run now" button / client wiring** — F-011 (F-008 is provable with curl + Postman).
- **"Disable while a run is in progress" UX** and any pre-invocation concurrency check — the Job's
  Firestore lock is the single source of truth (FR-E1 button-disable is PWA-side, F-011).
- **Firebase Auth project setup / sign-in** — the PWA owns enabling Google sign-in (F-009); F-008
  only *verifies* tokens. Enabling Firebase Auth on the project is an operational prerequisite.
- **Push notifications / run-completion signalling** — F-012.
- **CI/CD auto-deploy (WIF)** — deploy stays operator-run, consistent with F-007.
- **Rate limiting / WAF / multi-user** — single-tenant by design (PRD §4).

## Open Questions

1. **Run-identifier contract (FR-4).** The Minion mints `runId` internally and keys runs by date, so
   the trigger can't return the eventual `runId`. **Recommendation:** `202 { date, execution }`
   (today Europe/Paris + the Cloud Run execution name); the PWA watches `runs/{date}`. Alternative:
   pre-mint a ULID in the trigger and pass it to the Job (a Minion change to accept an injected
   runId). Decide in `/plan`.
2. **Job invocation mechanism (FR-3).** `google-auth-library` (mint an access token, POST the
   `jobs:run` REST endpoint — mirrors F-007's Scheduler) vs the `@google-cloud/run` typed client.
   **Recommendation:** `google-auth-library` + REST (smallest dep, matches the Scheduler call).
3. **Firebase verification mechanism (FR-2).** `firebase-admin` (`verifyIdToken`, handles JWKS +
   audience/issuer) vs hand-rolled JWKS verification. **Recommendation:** `firebase-admin` — correct
   and standard; note the added dependency. Confirm the Firebase project id / expected `aud`/`iss`.
4. **401 vs 403 split (FR-2).** Recommendation: `401` for "not authenticated" (no/invalid token),
   `403` for "authenticated but not the allowed identity". Confirm.
5. **HTTP layer (FR-1).** Keep the zero-dep `node:http` skeleton (a testable handler function) vs a
   minimal framework (`hono`). **Recommendation:** keep `node:http` — the surface is one route
   (~50 LOC, constitution §1). Confirm.
6. **Test runner.** `node:test` (built-in, zero-dep) vs `vitest` (matches the PWA if it uses it).
   **Recommendation:** `node:test` unless the PWA standardises on vitest. Decide in `/plan`.
7. **`--date` passthrough (FR-3).** Should `/trigger` accept an optional `{ date }` body for
   recovery/replay, or always run "today"? Recommendation: accept optional `date` (validated
   `YYYY-MM-DD`), default today — cheap and enables PWA-driven replay later. Confirm.
8. **Healthcheck route (FR-8).** Add `GET /healthz` → 200? Recommendation: yes (harmless, helps
   Cloud Run / uptime checks). Confirm.
9. **New dependencies.** `firebase-admin` and `google-auth-library` (both Google-maintained). Pin and
   note in the PR per constitution §6. Confirm acceptable.
