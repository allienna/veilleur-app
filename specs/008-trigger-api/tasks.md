# Tasks: trigger-api micro-service

**Plan**: specs/008-trigger-api/plan.md
**Status**: Ready
**Total**: 13 tasks across 3 phases (T-3.5 is operator-run, outside CI)

Conventions: TypeScript `strict`, no `any`/`@ts-ignore` (constitution §4); `pnpm --filter
@veilleur/trigger-api run {lint,typecheck,build,test}`; tests via `node --import tsx --test`. The
auth/invoke SDKs sit behind ports with fakes so the handler tests hermetically. **AC-9 (deploy +
live JWT smoke) needs GCP creds + a real Firebase token — operator-run, not CI.**

## Phase 1: Ports, auth, handler (pure core)

- [x] **T-1.1**: Dependencies + test wiring
  - **Do**: In `trigger-api/package.json` add deps `firebase-admin`, `google-auth-library`; devDep
    `tsx`; add `"test": "node --import tsx --test src/**/*.test.ts"`; remove the unused
    `@veilleur/shared` dep. Run `pnpm install`.
  - **Test**: `pnpm --filter @veilleur/trigger-api run typecheck` (installs resolve; no type errors)

- [x] **T-1.2**: Ports + error types
  - **Do**: Create `trigger-api/src/ports.ts`: `TokenVerifier` (`verifyToken(idToken: string):
    Promise<{ email: string; emailVerified: boolean }>`), `JobRunner` (`runJob(date?: string):
    Promise<{ execution: string }>`), and typed errors `UnauthenticatedError` / `JobRunError`.
  - **Test**: `pnpm --filter @veilleur/trigger-api run typecheck`

- [x] **T-1.3**: `assertAllowed` in auth.ts
  - **Do**: Extend `trigger-api/src/auth.ts` (keep the `ALLOWED_OPERATOR_EMAIL` pin) with
    `assertAllowed(claims: { email: string; emailVerified: boolean }): void` — throws a
    `ForbiddenError` unless `email === ALLOWED_OPERATOR_EMAIL && emailVerified === true`.
  - **Test**: `pnpm --filter @veilleur/trigger-api run test` (auth.test.ts: allowed / wrong-email / unverified)

- [x] **T-1.4**: Fakes
  - **Do**: Create `trigger-api/src/fakes.ts`: `FakeTokenVerifier` (returns scripted claims or
    throws `UnauthenticatedError`) and `FakeJobRunner` (records `runJob` calls incl. `date`, returns
    a fixed `{ execution }`; optionally throws `JobRunError`).
  - **Test**: `pnpm --filter @veilleur/trigger-api run typecheck`

- [x] **T-1.5**: Pure request handler
  - **Do**: Create `trigger-api/src/handler.ts`: `handleRequest({ method, url, headers, body }, {
    verifyToken, runJob, now }) -> { status, body }`. Routes: `POST /trigger` (bearer → verifyToken
    → assertAllowed → optional `date` validation `YYYY-MM-DD` → runJob → `202 { date, execution }`);
    `GET /healthz` → `200`; else `404`/`405`. Map errors: missing/invalid token → `401`, forbidden →
    `403`, bad date → `400`, `JobRunError` → `500` (generic). Never log token/PII.
  - **Test**: `pnpm --filter @veilleur/trigger-api run test` (handler.test.ts covers AC-1…AC-5 + 400/healthz)

## Phase 2: Real adapters + server wiring

- [x] **T-2.1**: Firebase token verifier
  - **Do**: Create `trigger-api/src/firebase.ts`: lazy-init `firebase-admin` (`applicationDefault()`,
    `projectId: "veilleur-app"`); `verifyToken` calls `getAuth().verifyIdToken(idToken, true)` and
    maps to `{ email, emailVerified }`, throwing `UnauthenticatedError` on any failure.
  - **Test**: `pnpm --filter @veilleur/trigger-api run typecheck && pnpm --filter @veilleur/trigger-api run build`

- [x] **T-2.2**: Cloud Run Job runner
  - **Do**: Create `trigger-api/src/jobRunner.ts`: `google-auth-library` `GoogleAuth` → access token
    → `POST https://run.googleapis.com/v2/projects/veilleur-app/locations/europe-west1/jobs/minion:run`.
    With `date`: body `{ overrides: { containerOverrides: [{ args: ["run","--date",date] }] } }`; else
    empty body. Parse + return `{ execution }`; throw `JobRunError` on non-2xx/transport.
  - **Test**: `pnpm --filter @veilleur/trigger-api run typecheck && pnpm --filter @veilleur/trigger-api run build`

- [x] **T-2.3**: Wire the server
  - **Do**: Rewrite `trigger-api/src/index.ts` to read the request (method/url/headers/body), call
    `handleRequest` with the real `firebase.verifyToken` + `jobRunner.runJob` + `() => new Date()`,
    write the response, and listen on `$PORT`. Structured logs (no tokens). Keep it ~50 LOC.
  - **Test**: `pnpm --filter @veilleur/trigger-api run build && PORT=8081 node trigger-api/dist/index.js & sleep 1; curl -s -o /dev/null -w '%{http_code}' localhost:8081/healthz; kill %1` (expect 200)

## Phase 3: Containerise, infra, CI, deploy

- [x] **T-3.1**: Dockerfile (repo-root pnpm deploy)
  - **Do**: Created `trigger-api/Dockerfile` (**Node 22** slim — pnpm 11.3 needs `node:sqlite` ≥22.13)
    + `trigger-api/Dockerfile.dockerignore` (BuildKit uses it over the root one, which excludes
    `trigger-api`). Builder from the **repo root**: `pnpm install --frozen-lockfile --filter
    @veilleur/trigger-api...`, build, `pnpm deploy --legacy --prod /app` (pnpm 10+ needs `--legacy`
    for a non-injected workspace); runtime runs `node dist/index.js` on `$PORT`. Also resolved the
    `pnpm-workspace.yaml` `allowBuilds` placeholders (`@firebase/util`/`protobufjs` → false).
  - **Test**: `docker buildx build -f trigger-api/Dockerfile -t veilleur-trigger-api:dev --load . && docker run ... /healthz` → ✅ verified (healthz 200, no-auth POST /trigger → 401, GET → 405). *Built natively (arm64) — the amd64 cross-build OOM'd under QEMU here; the deploy script's `--platform linux/amd64` runs on the deploy host / Cloud Build.*

- [x] **T-3.2**: Cloud Run service Terraform
  - **Do**: Create `infra/trigger-api.tf`: `trigger-api-sa` SA; `google_cloud_run_v2_job_iam_member`
    granting it `run.invoker` on the `minion` Job; `google_cloud_run_v2_service "trigger-api"` (image
    from Artifact Registry, env `PROJECT_ID`/`REGION`/`JOB=minion`, SA = `trigger-api-sa`, image under
    `ignore_changes`); `google_cloud_run_v2_service_iam_member` `allUsers` → `run.invoker` on the
    service (public ingress; the JWT is the gate — comment this). Add outputs (service URL).
  - **Test**: `terraform -chdir=infra fmt -check && terraform -chdir=infra validate`

- [x] **T-3.3**: CI workflow
  - **Do**: Create `.github/workflows/build-trigger-api.yml` (paths: `trigger-api/**`, `shared/**`,
    the workflow) — pnpm install + `lint` + `typecheck` + `build` + `test` for
    `@veilleur/trigger-api`. Hermetic (no creds).
  - **Test**: `uv run --with pyyaml python -c "import yaml; yaml.safe_load(open('.github/workflows/build-trigger-api.yml'))"` + `grep -q 'trigger-api' .github/workflows/build-trigger-api.yml`

- [x] **T-3.4**: Deploy script + runbook + final gate
  - **Do**: Create `scripts/deploy-trigger-api.sh` (build `linux/amd64` from repo root, push to
    Artifact Registry `…/minion/trigger-api`, `gcloud run deploy trigger-api --image …`; account/
    project preconditions like deploy-minion.sh). Add a trigger-api section to `infra/RUNBOOK.md`
    (deploy + the curl JWT smoke + a non-allowed-token rejection check). Run the repo-wide gate.
  - **Test**: `bash -n scripts/deploy-trigger-api.sh && pnpm check:email && pnpm --filter @veilleur/trigger-api run lint && pnpm --filter @veilleur/trigger-api run typecheck && pnpm --filter @veilleur/trigger-api run test && terraform -chdir=infra fmt -check && terraform -chdir=infra validate`

- [ ] **T-3.5** *(operational — operator-run, NOT CI; AC-9 evidence)*: Deploy + live JWT smoke
  - **Do**: With GCP creds (personal `veilleur-app` account) and Firebase Auth enabled: build/push +
    `terraform -chdir=infra apply` (creates the service + bindings) or `scripts/deploy-trigger-api.sh`;
    obtain a real operator Firebase ID token; `curl -X POST -H "Authorization: Bearer <token>"
    <service-url>/trigger` → `202 { date, execution }` and a new `runs/{date}` appears identical in
    shape to a scheduler run; a non-allowed/`unverified` token → `401`/`403`. Record evidence in the track.
  - **Test**: Manual — `curl` with a valid operator JWT returns `202` and triggers a real run; a
    non-allowed token is rejected. (Not run in CI.)
