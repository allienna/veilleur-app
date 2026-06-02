# Review: trigger-api micro-service

**Spec**: specs/008-trigger-api/spec.md
**Plan**: specs/008-trigger-api/plan.md
**Reviewed**: 2026-06-02
**Verdict**: ✅ **Pass with notes** (all in-repo artifacts done + verified; the operator-run deploy +
live JWT smoke T-3.5 / AC-9 is pending GCP creds + a real Firebase token, by design)

## 1. Task completion

12/13 tasks done. The open one, **T-3.5**, is the operational deploy + live JWT smoke — operator-run
and out-of-CI since the spec/plan/tasks. All in-repo, CI-verifiable work is complete.

## 2. Quality gates

| Gate | Result |
|------|--------|
| `tsc --noEmit` (strict, no `any`) | ✅ |
| `eslint .` | ✅ |
| `prettier --check` | ✅ |
| `node --test` (handler + auth) | ✅ 14 passed |
| `docker buildx … -f trigger-api/Dockerfile` + container smoke | ✅ `/healthz` 200, no-auth `POST /trigger` → 401, `GET /trigger` → 405 |
| `terraform fmt -check` + `validate` (with `infra/trigger-api.tf`) | ✅ |
| `pnpm check:email` (3-location pin) | ✅ |

## 3. Spec acceptance criteria → evidence

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: allowed verified JWT → invoke + `202 { date, execution }` | ✅ | `handler.test.ts` (happy + date passthrough) via `FakeJobRunner` |
| AC-2: missing/invalid token → 401, no invoke | ✅ | `handler.test.ts` |
| AC-3: wrong email / `email_verified=false` → 403, no invoke | ✅ | `handler.test.ts` + `auth.test.ts` |
| AC-4: unknown path → 404, wrong method → 405 | ✅ | `handler.test.ts` + container smoke |
| AC-5: `runJob` failure → 500, no leak | ✅ | `handler.test.ts` (generic `{error:"invoke_failed"}`) |
| AC-6: email pin identical; lint + typecheck pass | ✅ | `pnpm check:email`, eslint/tsc green |
| AC-7: handler/auth/invoker unit-tested with fakes (no Firebase/GCP/net) | ✅ | ports + `fakes.ts` |
| AC-8: Dockerfile builds + serves `/trigger`; Cloud Run service in `infra/` validates | ✅ | image smoke + `terraform validate` |
| AC-9: deployed; real curl-with-JWT triggers a run; non-allowed rejected | ⏳ | **operator-run (T-3.5)** |

## 4. Plan adherence & deviations

- **AD-1…AD-8 followed**: framework-free `node:http` + pure `handleRequest`; `firebase-admin`
  verifier; `google-auth-library` REST `jobs:run` with `--date` override; least-privilege SA +
  public-but-app-gated ingress; repo-root `pnpm deploy` Docker build; `node:test` + `tsx`.
- **Decisions honored**: `202 { date, execution }`; `firebase-admin verifyIdToken`; optional `date`
  default today; 401-vs-403 split; `/healthz`.
- **In-flight fixes (beyond the plan, required to build):**
  - **Node 22 base image** — pnpm 11.3 imports `node:sqlite` (needs ≥22.13); the plan said Node 20.
  - **`pnpm deploy --legacy`** — pnpm 10+ refuses a non-injected workspace deploy otherwise.
  - **`trigger-api/Dockerfile.dockerignore`** — the repo-root `.dockerignore` (written for the minion
    build) excludes `trigger-api`; a Dockerfile-specific ignore keeps the workspace in context.
  - **`pnpm-workspace.yaml` `allowBuilds`** — `pnpm install` left placeholder strings for
    `@firebase/util`/`protobufjs`; set to `false` (token verify is HTTPS/JWKS, no gRPC build needed).
  - **eslint `argsIgnorePattern: "^_"`** — to allow interface-stub unused params.

## 5. Notes / follow-ups (non-blocking)

- **Built natively (arm64), not amd64** — the amd64 cross-build OOM'd under QEMU locally (exit 134).
  The Dockerfile is correct; the deploy script's `--platform linux/amd64` runs on the deploy host /
  Cloud Build. Worth confirming the amd64 build there during T-3.5.
- **Firebase Auth enablement** is an operational prerequisite for AC-9 (F-009 owns sign-in setup);
  until then the operator mints a token via a one-off Firebase sign-in.
- **`firebase.ts` / `jobRunner.ts`** (SDK boundaries) are covered only by the operator smoke, not CI
  — intentional (the ports keep the handler hermetic).
- **F-005 date gap** still open (unrelated): `runner.py` doesn't pass the run date; here the trigger
  passes `--date` correctly, so a PWA-driven replay will work once F-005's internal default is fixed.
