# Plan: trigger-api micro-service

**Spec**: specs/008-trigger-api/spec.md

Fills the F-002 `trigger-api` skeleton: a tiny Cloud Run **service** that verifies a Firebase JWT,
asserts the single allowed operator email, and invokes the `minion` Cloud Run Job (F-007). In-repo
deliverables (service code, Dockerfile, Terraform, tests, CI) are CI-verifiable; the actual deploy +
live JWT smoke (AC-9) is operator-run, consistent with F-007.

## Resolved Open Questions

| # | Question | Resolution |
|---|----------|-----------|
| 1 | Run-identifier contract | **`202 { date, execution }`** (user) — today (Europe/Paris) or the requested date + the Cloud Run execution name; PWA watches `runs/{date}`. No Minion change. |
| 2 | Job invocation mechanism | `google-auth-library` access token + REST `jobs:run` (mirrors F-007's Scheduler call); container-args **override** carries `--date`. |
| 3 | JWT verification | **`firebase-admin` `verifyIdToken`** (user), project `veilleur-app`. Firebase Auth enablement is operational (F-009 owns sign-in). |
| 4 | 401 vs 403 | `401` not-authenticated (missing/invalid token); `403` authenticated-but-not-allowed (wrong email / `email_verified=false`). |
| 5 | HTTP layer | Keep the zero-dep `node:http` skeleton; logic in a **pure `handleRequest` function** for hermetic tests. |
| 6 | Test runner | **`node:test` + `tsx`** (built-in runner, TS via tsx) — no test framework exists in the repo yet; keep it light. |
| 7 | `--date` passthrough | **Optional `{ date }`** (user), validated `YYYY-MM-DD`, default today; passed to the Job as a `--date` container-args override. |
| 8 | Healthcheck | Add `GET /healthz` → `200`. |
| 9 | New deps | `firebase-admin`, `google-auth-library` (prod); `tsx` (dev). Drop the **unused** `@veilleur/shared` dep (the service needs no shared types) to keep containerisation simple. |

## Architecture Decisions

### AD-1: Framework-free `node:http` + a pure, injectable request handler
- **Choice**: Keep `node:http`. Put all logic in `handleRequest(req, deps) -> { status, headers, body }`
  where `deps = { verifyToken, runJob, now }` are injected ports. `index.ts` is the thin server that
  reads the request, calls `handleRequest` with the real ports, and writes the response.
- **Rationale**: One route (~50 LOC, constitution §1); a pure handler is trivially unit-tested with
  fakes — no HTTP server, Firebase, or GCP in CI.
- **Alternatives**: `hono`/`express` (rejected — needless dependency for one endpoint).

### AD-2: `TokenVerifier` port over `firebase-admin`
- **Choice**: `verifyToken(idToken) -> { email, emailVerified }` Protocol. Prod impl initialises
  `firebase-admin` once (`applicationDefault()` creds, `projectId: "veilleur-app"`) and calls
  `auth().verifyIdToken(idToken, true)`. `auth.ts` keeps the `ALLOWED_OPERATOR_EMAIL` pin and adds
  `assertAllowed(claims)`; a malformed/invalid token throws → `401`, a valid-but-wrong identity →
  `403`.
- **Rationale**: `verifyIdToken` correctly checks signature/JWKS/`aud`/`iss`/`exp` — don't hand-roll
  an auth boundary (constitution §2.1, PRD FR-F1). The port keeps the SDK out of unit tests.
- **Alternatives**: hand-rolled JWKS (`jose`) — rejected (security-critical, easy to get subtly wrong).

### AD-3: `JobRunner` port over the Cloud Run Admin REST API
- **Choice**: `runJob(date?) -> { execution }` Protocol. Prod impl uses `google-auth-library`
  (`GoogleAuth` ADC → access token) to `POST https://run.googleapis.com/v2/projects/veilleur-app/
  locations/europe-west1/jobs/minion:run`. When `date` is set, body =
  `{ overrides: { containerOverrides: [{ args: ["run","--date",date] }] } }`; otherwise empty body
  (Job's default `["run"]`). Returns the execution/operation name from the response.
- **Rationale**: Mirrors F-007's Scheduler→Jobs call (same endpoint/auth), smallest dependency, and
  the minion CLI already accepts `--date`. The Job is the single entry point, so the run shape is
  identical to the scheduler path by construction (FR-A1).
- **Alternatives**: `@google-cloud/run` typed client (heavier dep for one call).

### AD-4: Response + status contract
- **Choice**: success → `202 { date, execution }`. `401` (unauthenticated), `403` (not allowed),
  `404` (unknown path), `405` (wrong method on `/trigger`), `500` (invoke failure, generic body).
  `GET /healthz` → `200 { ok: true }`. Error bodies are minimal; tokens/PII never logged.
- **Rationale**: AD per Open Q#1/#4/#8; `202` reflects async Job start.

### AD-5: Least-privilege identity + public-but-app-gated ingress
- **Choice**: A `trigger-api-sa` service account holding **only** `run.invoker` on the `minion` Job.
  The Cloud Run **service** allows unauthenticated *ingress* (`allUsers` `run.invoker` on the
  service) so the browser/PWA can reach it; the **real boundary is the in-app Firebase JWT check**
  (FR-2) — exactly the constitution §2.1 "gate the action, not the bundle" stance.
- **Rationale**: A browser can't present a Cloud-Run IAM token; app-layer auth is the gate. The
  service SA stays minimal.
- **Alternatives**: Cloud Run IAM-authenticated ingress (rejected — browsers can't satisfy it).

### AD-6: Containerise from the repo root via `pnpm deploy` (F-007 lesson applied up front)
- **Choice**: `trigger-api/Dockerfile` (Node 20 slim) **builds from the repo root** so the pnpm
  workspace + lockfile resolve: builder runs `pnpm install --frozen-lockfile`, builds the workspace,
  then `pnpm deploy --filter @veilleur/trigger-api --prod /app`; the runtime stage copies `/app` and
  runs `node dist/index.js` on `$PORT`. Build: `docker buildx build -f trigger-api/Dockerfile .`.
- **Rationale**: Avoids the cross-package build failure F-007 hit. Dropping the unused
  `@veilleur/shared` dep further shrinks the closure.
- **Alternatives**: build from `trigger-api/` (rejected — pnpm workspace lockfile lives at root).

### AD-7: Terraform Cloud Run service in the production root
- **Choice**: `infra/trigger-api.tf` adds the `trigger-api-sa`, its `run.invoker` on the `minion`
  Job, the `google_cloud_run_v2_service "trigger-api"` (image from Artifact Registry, env
  `PROJECT_ID`/`REGION`/`JOB`), and the `allUsers` invoker binding on the service. Additive — no
  spike-state collisions.
- **Rationale**: Same production root as F-007; keeps all infra reviewable in one place.

### AD-8: node:test + tsx, ports + fakes
- **Choice**: Tests in `src/*.test.ts`, run with `node --import tsx --test` (added as the
  `test` script). `FakeTokenVerifier` (scripted claims or throw) and `FakeJobRunner` (records calls,
  returns a fixed execution) drive the handler tests. No Firebase/GCP/network in CI.
- **Rationale**: Lightest possible — no test framework added to the repo; TS runs via `tsx`.

## Affected Files

### New Files
| File | Purpose |
|------|---------|
| `trigger-api/src/handler.ts` | Pure `handleRequest(req, deps)` — routing, auth gate, invoke, response (AD-1/AD-4). |
| `trigger-api/src/ports.ts` | `TokenVerifier`, `JobRunner` interfaces + error types. |
| `trigger-api/src/firebase.ts` | `firebase-admin` `verifyToken` impl (AD-2). |
| `trigger-api/src/jobRunner.ts` | `google-auth-library` + REST `jobs:run` impl (AD-3). |
| `trigger-api/src/fakes.ts` | `FakeTokenVerifier`, `FakeJobRunner` for tests. |
| `trigger-api/src/handler.test.ts` | Handler unit tests (all ACs 1–5). |
| `trigger-api/src/auth.test.ts` | `assertAllowed` allowed/!allowed/!verified. |
| `trigger-api/Dockerfile` | Node 20 slim, repo-root `pnpm deploy` build (AD-6). |
| `infra/trigger-api.tf` | Cloud Run service + SA + `run.invoker` + public-ingress binding (AD-7). |
| `scripts/deploy-trigger-api.sh` | Build/push/deploy the service (operator-run, mirrors deploy-minion.sh). |
| `.github/workflows/build-trigger-api.yml` | CI: pnpm lint/typecheck/build + `node:test` (hermetic). |

### Modified Files
| File | Change |
|------|--------|
| `trigger-api/src/index.ts` | Wire the real `handleRequest` + real ports; add `/healthz`; listen on `$PORT`. |
| `trigger-api/src/auth.ts` | Add `assertAllowed(claims)` (keep the `ALLOWED_OPERATOR_EMAIL` pin). |
| `trigger-api/package.json` | +`firebase-admin`, `google-auth-library`; +dev `tsx`; add `test` script; drop unused `@veilleur/shared`. |
| `pnpm-lock.yaml` | Dependency changes. |
| `infra/RUNBOOK.md` | Add a trigger-api deploy + JWT-smoke section. |

## Test Strategy
- **Mocking approach**: ports + in-memory fakes (the project's established pattern). `handleRequest`
  is pure — tests call it directly with fakes; no server bound, no Firebase, no GCP. `firebase.ts`
  and `jobRunner.ts` (SDK boundaries) are covered only by the operator smoke (AC-9), not CI.
- **Happy paths**: allowed + verified token → `runJob` called once (with/without `date`) → `202
  { date, execution }`.
- **Error scenarios**: missing/malformed header → `401`, no invoke; invalid token (verifier throws)
  → `401`; wrong email → `403`; `email_verified=false` → `403`; bad path → `404`; GET `/trigger` →
  `405`; `runJob` throws → `500` generic, no leak.
- **Edge cases**: optional `date` validated (`YYYY-MM-DD`; bad date → `400`); `/healthz` → `200`;
  no token value ever appears in a logged line; email pin byte-identical (`pnpm check:email`).

## Risk & Complexity
- **Estimated complexity**: **Medium** — small surface, but it's a security boundary (auth) + two
  external SDKs + a Cloud Run service to deploy.
- **Key risks**:
  - **Auth correctness** — mitigated by using `firebase-admin` (not hand-rolled) and exhaustive
    handler tests for every rejection path.
  - **`jobs:run` overrides shape** — the container-args override must be exact; verified by the
    operator smoke (AC-9) against the real Job.
  - **Public ingress** — intentional (browser reachability); the JWT check is the boundary. Documented
    so it isn't mistaken for a hole.
  - **Monorepo Docker build** — pre-empted with the repo-root `pnpm deploy` pattern (F-007 lesson).
  - **Operator dependency** — deploy + live JWT smoke need GCP creds + a real Firebase token (AC-9).
- **New dependencies**: `firebase-admin`, `google-auth-library` (prod, Google-maintained); `tsx`
  (dev). Dropping `@veilleur/shared` is a net removal.
