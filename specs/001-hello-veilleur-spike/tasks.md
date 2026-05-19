# Tasks: Hello-Veilleur spike

**Plan**: specs/001-hello-veilleur-spike/plan.md
**Status**: Ready
**Total**: 22 tasks across 5 phases

> No `CLAUDE.md` exists yet (F-002 introduces it). Verification commands use `uv run …` directly. Tests in the formal sense are intentionally absent — the acceptance gate is the live end-to-end run (per plan §Test Strategy). Each task's **Test** is a concrete smoke check, not a unit test.

## Phase 1 — Python workspace + structured logging + models

- [x] **T-1.1**: Initialize `minion/` Python workspace
  - **Do**: Create `minion/pyproject.toml` declaring Python 3.12, project name `veilleur-minion`, runtime deps (`google-api-python-client`, `google-auth`, `google-genai`, `google-cloud-firestore`, `google-cloud-secret-manager`, `pydantic>=2`, `python-json-logger`, `httpx`, `pillow`, `click`), dev deps (`ruff`, `pyright`), and `[tool.ruff]` + `[tool.pyright]` blocks. Run `uv sync` to materialize `.venv` and produce `minion/uv.lock`. Create `minion/.dockerignore` excluding `.venv`, `__pycache__`, `*.pyc`, `.pytest_cache`, `tests/`.
  - **Test**: `cd minion && uv run python -c "import google.genai, google.cloud.firestore, pydantic, click; print('ok')"` prints `ok`.

- [ ] **T-1.2**: Repo-root `.gitignore`
  - **Do**: Create `.gitignore` at the repo root with `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.DS_Store`, `*.log`, `.env`, `.env.local`, `minion/.venv/`, `minion/uv.lock` is **not** ignored (lockfile must be committed per constitution §6).
  - **Test**: `git status --porcelain | grep -E '(\.venv|__pycache__|\.DS_Store)'` returns nothing after creating those paths.

- [ ] **T-1.3**: Spike package skeleton + Click CLI entry
  - **Do**: Create `minion/src/minion/__init__.py` (empty), `minion/src/minion/spike/__init__.py` (empty), and `minion/src/minion/spike/__main__.py` containing a Click group with two stub subcommands `run` (accepts `--date YYYY-MM-DD`, default today) and `claude-probe` (no args), both currently raising `NotImplementedError`. Configure `pyproject.toml` `[tool.hatch.build]` (or equivalent) so `src/` layout works.
  - **Test**: `cd minion && uv run python -m minion.spike --help` lists `run` and `claude-probe`; both subcommands exit non-zero with `NotImplementedError`.

- [ ] **T-1.4**: Structured JSON logger
  - **Do**: Create `minion/src/minion/spike/logging.py` exporting `get_logger(run_id: str) -> logging.Logger`. Configure root logger once via `python-json-logger.JsonFormatter` with fields `timestamp, level, name, message, run_id, step`. Logger writes to stdout only.
  - **Test**: `cd minion && uv run python -c "from minion.spike.logging import get_logger; g = get_logger('test-123'); g.info('hello', extra={'step': 'init'})"` emits a single JSON line with `run_id=test-123`, `step=init`, `message=hello`.

- [ ] **T-1.5**: `SpikeRunRecord` Pydantic model
  - **Do**: Create `minion/src/minion/spike/models.py` defining `SpikeRunRecord(BaseModel)` with fields `run_id: str`, `started_at: datetime`, `ended_at: datetime | None`, `gmail_unread_count: int | None`, `imagen_status: Literal["ok", "blocked", "error"]`, `image_bytes_size: int | None`, `github_commit_sha: str | None`. Include a `make_run_id(date: str) -> str` helper producing `spike-{date}-{uuid4().hex[:8]}` per AD-8.
  - **Test**: `cd minion && uv run python -c "from minion.spike.models import SpikeRunRecord, make_run_id; r = SpikeRunRecord(run_id=make_run_id('2026-05-19'), started_at='2026-05-19T08:00:00Z', imagen_status='ok'); print(r.run_id, r.model_dump_json())"` prints a `spike-2026-05-19-<8hex>` runId and a JSON dump with no validation error.

## Phase 2 — External client modules (vertical slices, no orchestration)

- [ ] **T-2.1**: Secret Manager helper with `ANTHROPIC_API_KEY` guard
  - **Do**: Create `minion/src/minion/spike/secrets.py` exporting `get(name: str) -> str` (returns latest version's payload) and `require(name: str)` (raises `MissingSecretError` if absent). On module import, assert `os.environ.get("ANTHROPIC_API_KEY") is None`; raise `RuntimeError` with explicit message if set (constitution §2 principle 2).
  - **Test**: Provision a temp secret `gcloud secrets create spike-test-secret --data-file=- <<< "hello"`, then `cd minion && uv run python -c "from minion.spike.secrets import get; print(get('spike-test-secret'))"` prints `hello`. Then `ANTHROPIC_API_KEY=foo uv run python -c "import minion.spike.secrets"` exits non-zero. Cleanup: `gcloud secrets delete spike-test-secret --quiet`.

- [ ] **T-2.2**: Gmail unread-count probe
  - **Do**: Create `minion/src/minion/spike/gmail.py` exporting `count_unread_last_24h() -> int`. Reads `gmail-oauth-refresh-token` via `secrets.get`, exchanges for an access token, calls `users.messages.list` with `q="is:unread newer_than:1d"` and `maxResults=1` + `resultSizeEstimate` fields. No body fetch. Returns the size estimate.
  - **Test**: `cd minion && uv run python -c "from minion.spike.gmail import count_unread_last_24h; print(count_unread_last_24h())"` prints a non-negative integer. (Requires `gmail-oauth-refresh-token` secret to exist — provisioned in T-4.1.)

- [ ] **T-2.3**: Imagen placeholder generator
  - **Do**: Create `minion/src/minion/spike/imagen.py` defining module-level `SPIKE_IMAGEN_PROMPT` (the mascot prompt per AD-9), and `generate_placeholder() -> bytes`. Uses `google.genai.Client(vertexai=True, project='veilleur-app', location='europe-west1')` with `imagen-4.0-fast-generate-001`, aspect ratio `16:9`, one image. Converts the returned PNG/JPEG to WebP via Pillow. One retry on moderation rejection; if both fail, raise `ImagenBlockedError`.
  - **Test**: `cd minion && uv run python -c "from minion.spike.imagen import generate_placeholder; b = generate_placeholder(); open('/tmp/spike-img.webp','wb').write(b); print(len(b))"` prints a size >5 KB. Visual check: `open /tmp/spike-img.webp` (macOS) shows a navy owl with amber eyes.

- [ ] **T-2.4**: Firestore run writer
  - **Do**: Create `minion/src/minion/spike/firestore.py` exporting `write_run(record: SpikeRunRecord) -> None`. Uses `google.cloud.firestore.Client(project='veilleur-app', database='(default)')` to set `runs/{record.run_id}` with `record.model_dump(mode='json')`. Overwrites existing docs (idempotent per AD-8 prep).
  - **Test**: `cd minion && uv run python -c "from minion.spike.firestore import write_run; from minion.spike.models import SpikeRunRecord, make_run_id; from datetime import datetime, timezone; write_run(SpikeRunRecord(run_id=make_run_id('2026-05-19'), started_at=datetime.now(timezone.utc), imagen_status='ok'))"` exits 0. Verify with `gcloud firestore documents read --collection-path=runs --limit=1` showing the new doc.

- [ ] **T-2.5**: GitHub Contents API committer
  - **Do**: Create `minion/src/minion/spike/github.py` exporting `commit_image(date: str, content: bytes) -> str`. PUTs to `https://api.github.com/repos/allienna/allienna.github.io/contents/veilleur/site/public/images/spikes/{date}.webp` with base64-encoded content, commit message `chore(spike): image probe {date}`, branch `main`. Reads `github-pat-allienna-pages` via `secrets.get`. Handles both create (no `sha`) and update (with prior `sha`) by first GETting the file. Returns the new commit SHA from the response.
  - **Test**: `cd minion && uv run python -c "from minion.spike.github import commit_image; sha = commit_image('2026-05-19', open('/tmp/spike-img.webp','rb').read()); print(sha)"` prints a 40-hex SHA. Verify the commit at `https://github.com/allienna/allienna.github.io/commits/main` and the file at `veilleur/site/public/images/spikes/2026-05-19.webp`.

- [ ] **T-2.6**: Claude OAuth subprocess probe
  - **Do**: Create `minion/src/minion/spike/claude_probe.py` exporting `pong() -> bool`. Invokes `subprocess.run(["claude", "-p", "--permission-mode", "bypassPermissions", "Output the word PONG and nothing else."], capture_output=True, text=True, timeout=60, env=...)`. The env must include `CLAUDE_CODE_OAUTH_TOKEN` (from `secrets.get`) and must **not** include `ANTHROPIC_API_KEY`. Asserts `stdout.strip().startswith("PONG")`; returns True/False. On failure logs stderr.
  - **Test**: `cd minion && uv run python -c "from minion.spike.claude_probe import pong; print(pong())"` prints `True` against the operator's host `claude` install. (Deployed-container test happens in T-4.5 — the load-bearing AC-5 gate.)

## Phase 3 — Orchestration + Dockerfile + local end-to-end

- [ ] **T-3.1**: Wire 4-step `run` orchestration
  - **Do**: In `minion/src/minion/spike/__main__.py`, implement the `run` subcommand. Sequentially: (1) `count = gmail.count_unread_last_24h()`, (2) `img = imagen.generate_placeholder()`, (3) `firestore.write_run(record)` (partial), (4) `sha = github.commit_image(date, img)`, then update the same Firestore doc with `ended_at` + `github_commit_sha`. Log one JSON line per step via `get_logger(run_id)` including `step`, `status`, `duration_ms`. Exit non-zero on any step failure (no partial degradation, except for `ImagenBlockedError` which sets `imagen_status="blocked"` and continues).
  - **Test**: `cd minion && uv run python -m minion.spike run --date 2026-05-19` completes in <90s against the real `veilleur-app` project. stdout shows 5 JSON lines (4 step lines + 1 final summary). Firestore has the `runs/spike-2026-05-19-<8hex>` doc with all fields populated.

- [ ] **T-3.2**: Wire `claude-probe` subcommand
  - **Do**: In `__main__.py`, implement the `claude-probe` subcommand. Calls `claude_probe.pong()` and exits 0 on True, 1 on False. Emits one JSON log line `{"step": "claude_probe", "status": "ok"|"failed"}`.
  - **Test**: `cd minion && uv run python -m minion.spike claude-probe` exits 0 against the operator's host `claude` install.

- [ ] **T-3.3**: Multi-stage `linux/amd64` Dockerfile
  - **Do**: Create `minion/Dockerfile` per AD-4. Stage 1: `python:3.12-slim` + install `uv` + copy `pyproject.toml` + `uv.lock` + `uv sync --frozen --no-dev` into `/opt/venv`. Stage 2: `python:3.12-slim` base, apt-install `git` + `curl` + `ca-certificates` + Node 20 (via NodeSource setup script), `npm i -g @anthropic-ai/claude-code`, copy `/opt/venv` from stage 1, copy `src/` into `/app`. `WORKDIR /app`. `ENTRYPOINT ["python", "-m", "minion.spike"]`. Header comment documents `--platform linux/amd64` requirement.
  - **Test**: `docker build --platform linux/amd64 -t veilleur-spike:dev minion/` succeeds on Apple Silicon. `docker run --rm --platform linux/amd64 veilleur-spike:dev --help` lists `run` and `claude-probe`.

- [ ] **T-3.4**: Local docker end-to-end verification
  - **Do**: Create `scripts/spike-local.sh` that runs `docker run --rm --platform linux/amd64 -v "$HOME/.config/gcloud:/root/.config/gcloud:ro" -e GOOGLE_CLOUD_PROJECT=veilleur-app veilleur-spike:dev run --date "$(date -u +%F)"`. Make it executable. Document in `minion/README.md` placeholder.
  - **Test**: `./scripts/spike-local.sh` produces an equivalent Firestore document + GitHub commit to T-3.1, but originating from the container. The `runId` should be a new one (a fresh `make_run_id` call); only the structural fields need to match.

## Phase 4 — Cloud deployment + R1 close-out (the load-bearing milestone)

- [ ] **T-4.1**: Idempotent secret provisioning script
  - **Do**: Create `scripts/provision-spike-secrets.sh`. First assertion: `[[ "$(gcloud config get-value project)" == "veilleur-app" ]]` or hard-exit. For each of the five secret names (`gmail-oauth-refresh-token`, `anthropic-oauth-token`, `github-pat-allienna-pages`, `anthropic-api-key-fallback`, `vapid-private-key`), create with `gcloud secrets create <name> --replication-policy=automatic` swallowing "already exists" errors. Then for each, run `gcloud secrets versions list <name>` — if zero versions, print a clear "Issue this value at <URL/runbook> then run: `gcloud secrets versions add <name> --data-file=-` and re-run this script" message and exit 1. Special URL for `github-pat-allienna-pages`: `https://github.com/settings/personal-access-tokens/new` with the scopes documented. Make executable.
  - **Test**: First run with no secrets present creates all five, then fails with the PAT-issuance message. After manually adding versions for the three needed secrets (`gmail-oauth-refresh-token`, `anthropic-oauth-token`, `github-pat-allienna-pages`), re-running the script exits 0 silently. A third run continues to exit 0 (idempotent).

- [ ] **T-4.2**: Idempotent IAM provisioning script
  - **Do**: Create `scripts/provision-spike-iam.sh`. Asserts the active project as in T-4.1. Creates `spike-minion-sa@veilleur-app.iam.gserviceaccount.com` (swallow "already exists"). Grants project-level `roles/aiplatform.user` and `roles/datastore.user`. For each of the three actively-used secrets (`gmail-oauth-refresh-token`, `anthropic-oauth-token`, `github-pat-allienna-pages`), grant `roles/secretmanager.secretAccessor` per-secret (not project-wide — constitution §6). Print the SA email at the end.
  - **Test**: First run creates SA + bindings, exits 0. `gcloud iam service-accounts describe spike-minion-sa@veilleur-app.iam.gserviceaccount.com` shows the account. `gcloud secrets get-iam-policy gmail-oauth-refresh-token --format=json | grep spike-minion-sa` shows the per-secret binding. Re-running is idempotent (no errors, no duplicates).

- [ ] **T-4.3**: Cloud deploy script (Artifact Registry push + Cloud Run Job create/update)
  - **Do**: Create `scripts/spike-cloud.sh`. (a) Ensures Artifact Registry repo `europe-west1-docker.pkg.dev/veilleur-app/minion` exists (`gcloud artifacts repositories describe minion --location=europe-west1 || gcloud artifacts repositories create minion --location=europe-west1 --repository-format=docker`). (b) Builds image with `--platform linux/amd64` tagged `europe-west1-docker.pkg.dev/veilleur-app/minion/spike:dev-$(git rev-parse --short HEAD)` and `:latest`. (c) `docker push` both tags. (d) Creates or updates Cloud Run Job `spike-minion` in `europe-west1` with the image, the `spike-minion-sa` service account, `--max-retries=0`, `--task-timeout=20m`. The Job entrypoint args are the `run --date $(date -u +%F)` subcommand by default; allow override via `$1` (e.g., `claude-probe`). Make executable.
  - **Test**: First run pushes the image, creates the Job, but does **not** execute it. `gcloud run jobs describe spike-minion --region=europe-west1` shows the Job exists with the correct SA. Re-running with a new commit pushes a new tag and updates the Job's image — idempotent.

- [ ] **T-4.4**: Execute `claude-probe` in deployed container — **AC-5 / R1 close-out gate**
  - **Do**: Run `gcloud run jobs execute spike-minion --region=europe-west1 --args=claude-probe --wait`. Then `gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=spike-minion' --limit=20 --format=json` and confirm the JSON log line `{"step": "claude_probe", "status": "ok"}` is present. **This is the load-bearing milestone of F-001.** If this fails, trigger the OQ-5 escalation procedure: do not proceed to T-4.5/T-4.6; instead create `specs/001-hello-veilleur-spike/escalation.md` documenting the failure, decide between the three escalation options (API-key fallback, descope F-005 agentic step, M7 slip), and resume only after the decision is made.
  - **Test**: Job execution exits with `status: "Completed"`. Cloud Logging shows the `claude_probe ok` line. Re-running the execution multiple times always succeeds (proves OAuth token stability inside the container, not a one-shot fluke).

- [ ] **T-4.5**: Execute full `run` in deployed container — **AC-2 / AC-3 / AC-4 verification**
  - **Do**: Run `gcloud run jobs execute spike-minion --region=europe-west1 --wait` (no args = defaults to `run --date ...`). Verify in Firestore that a `runs/spike-<date>-<8hex>` doc exists with `gmail_unread_count`, `imagen_status`, `image_bytes_size`, `github_commit_sha` all populated. Verify in `https://github.com/allienna/allienna.github.io/commits/main` that a commit at `veilleur/site/public/images/spikes/<date>.webp` exists with the matching SHA.
  - **Test**: All three artifacts present and consistent (Firestore SHA == GitHub SHA). Total Job duration < 5 min (AC-10).

- [ ] **T-4.6**: Run validations — AC-1, AC-6, AC-7, AC-8
  - **Do**: (a) AC-1: clean clone in `/tmp`, run `docker build --platform linux/amd64 ...`, confirm success. (b) AC-6: `grep -rn 'print(' minion/src/ scripts/` should return nothing (or only inside log-config code, never as a substitute for logger). (c) AC-7: re-run `provision-spike-secrets.sh` after all secrets exist; exit 0 silently. (d) AC-8: `gcloud projects get-iam-policy veilleur-app --format=json | jq '.bindings[] | select(.members[] | contains("spike-minion-sa")) | .role'` should NOT contain `roles/secretmanager.secretAccessor` at the project level.
  - **Test**: All four assertions pass.

## Phase 5 — README + finalization

- [ ] **T-5.1**: `minion/README.md` covering the human prerequisites and run sequence
  - **Do**: Create `minion/README.md` documenting (in order): `gcloud auth login` + `gcloud config set project veilleur-app` + `gcloud auth application-default login` → `claude setup-token` (capture OAuth token) → GitHub fine-grained PAT issuance at the linked URL with required scopes → `./scripts/provision-spike-secrets.sh` (twice: once to create slots, once to confirm secrets are present) → `./scripts/provision-spike-iam.sh` → `./scripts/spike-local.sh` (Apple Silicon note: `--platform linux/amd64`) → `./scripts/spike-cloud.sh` → `gcloud run jobs execute spike-minion --region=europe-west1 --args=claude-probe --wait` → final full run. Include a "Troubleshooting" subsection with the platform-mismatch error and the `ANTHROPIC_API_KEY must be absent` guard.
  - **Test**: Read top-to-bottom; every command is copy-pasteable, no placeholders remain. `grep -E '<.*>' minion/README.md` returns no template placeholders.

- [ ] **T-5.2**: AC checklist + status update
  - **Do**: Verify each AC-1 through AC-10 against the artifacts produced in Phases 3 and 4. Update `specs/001-hello-veilleur-spike/spec.md` AC checkboxes to `[x]`. Update `specs/roadmap.md` F-001 status from `Planning` to `In Progress` if a task in this list is still open at this point, or to `Review` (preparing for `/review`) if all 22 tasks here are checked.
  - **Test**: `grep '\[ \]' specs/001-hello-veilleur-spike/spec.md` returns nothing under the Acceptance Criteria section. `grep 'Status:' specs/roadmap.md | grep F-001 -A1` (or equivalent) shows the new status.
