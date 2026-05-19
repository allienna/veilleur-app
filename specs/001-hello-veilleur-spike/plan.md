# Plan: Hello-Veilleur spike

**Spec**: specs/001-hello-veilleur-spike/spec.md
**Resolved open questions**:
- OQ-1 → host on the **prod `veilleur-app`** GCP project (no throwaway).
- OQ-2 → Cloud Run region **`europe-west1`** (Belgium).
- OQ-3 → GitHub fine-grained PAT state is **unknown**; treat as a human prerequisite, gate the script on the secret being present.
- OQ-4 → keep `spike.py` indefinitely at `minion/src/minion/spike.py` as a regression probe.
- OQ-5 → **1.5-day hard timebox**. If AC-5 (R1 close-out) is not green by EOD +1.5, escalate before continuing — options are: accept the Anthropic API-key fallback (constitution §2 deviation, requires explicit decision), descope F-005's agentic step from the talk, or further M7 slip.

## Architecture Decisions

### AD-1: One module, two CLI subcommands
- **Choice**: `python -m minion.spike` exposes two subcommands — `run --date YYYY-MM-DD` (the 4-step chain) and `claude-probe` (the OAuth headless probe).
- **Rationale**: Subcommands isolate `claude -p` from the rest of the chain so a Claude OAuth failure can be tested independently of Gmail/Vertex/Firestore/GitHub. The probe ends up the first thing the deployed Cloud Run Job verifies; the run is what produces evidence for AC-2/AC-3/AC-4.
- **Alternatives considered**: Single composite command — rejected because mixing probes hides root causes. Separate Python entry-point scripts — rejected because they fragment the module structure that F-003 will inherit.

### AD-2: Single Pydantic model for the run record
- **Choice**: `minion/src/minion/spike/models.py` defines one `SpikeRunRecord(BaseModel)` with the exact shape spec FR-2 requires (`runId`, `started_at`, `ended_at`, `gmail_unread_count`, `imagen_status`, `image_bytes_size`, `github_commit_sha`).
- **Rationale**: Constitution §4 mandates Pydantic at every I/O boundary. F-003 will replace this model with the richer real one — keeping it in one file makes that migration trivial. Same model serializes to Firestore and to the structured log line.
- **Alternatives considered**: TypedDict — rejected (no validation, breaks constitution §4). Hand-rolled dict — rejected for the same reason.

### AD-3: Structured logging via stdlib `logging` + `python-json-logger`
- **Choice**: Configure root logger to emit JSON lines on stdout via `python-json-logger`. Each log record includes `runId`, `step`, `level`, plus per-step fields (`duration_ms`, `status`). No `print()` anywhere.
- **Rationale**: Cloud Logging auto-parses JSON on stdout — zero config on the GCP side. F-003 onwards reuses the same logger. Easy to grep `runId` in `gcloud logging read` for debugging.
- **Alternatives considered**: `structlog` — richer but a heavier dep for a spike. `loguru` — opinionated formatting fights JSON cleanly. Stdlib + json-logger is the minimum that satisfies AC-6.

### AD-4: Multi-stage Dockerfile, single final layer
- **Choice**: Stage 1 — `python:3.12-slim` + `uv` to build a `/opt/venv` with locked deps. Stage 2 — `python:3.12-slim` + `node:20` apt-add + `npm i -g @anthropic-ai/claude-code` + `git`. Final stage copies `/opt/venv` from stage 1 + the application code. Final image targets `linux/amd64`.
- **Rationale**: Cloud Run Job runs `linux/amd64` only; Apple Silicon builds require `--platform linux/amd64` (must be documented per spec error scenarios). Multi-stage keeps the deps layer cacheable across iterations. Pinning Node 20 + Python 3.12 matches the constitution stack lock.
- **Alternatives considered**: `astral-sh/uv:python3.12` base — appealing but unproven for adding Node alongside. Distroless — rejected; we need git + claude binary. Two separate images (Python-only + Node-only orchestration) — rejected; the agentic step needs both in one process.

### AD-5: ADC for local, Workload Identity for Cloud Run
- **Choice**: Locally, operator runs `gcloud auth application-default login` once; the container picks up ADC via mounted `~/.config/gcloud`. In Cloud Run, the job uses Workload Identity bound to `spike-minion-sa@veilleur-app.iam.gserviceaccount.com`. Secrets accessed via `google-cloud-secret-manager` SDK in both modes — same code path.
- **Rationale**: One auth path inside the container. The only difference is where the credentials come from. This is exactly what AC-2 + AC-3 (local ↔ cloud parity) demand.
- **Alternatives considered**: Service-account JSON keys — explicitly forbidden by constitution §6 ("ADC + IAM only"). `gcloud auth print-access-token` baking — rejected; not refreshable.

### AD-6: Gmail SDK, Vertex AI Imagen SDK, Firestore SDK, GitHub Contents API direct HTTP
- **Choice**: `google-api-python-client` for Gmail, `google-genai` (vertexai mode) for Imagen, `google-cloud-firestore` for Firestore, `httpx` + raw GitHub Contents API for the commit (no `PyGithub` dep).
- **Rationale**: Constitution §3 locks Vertex / Firestore SDKs. Gmail's SDK is the only sensible path. GitHub Contents API is ~30 LOC — pulling `PyGithub` is dead weight for one PUT. `httpx` is reused in F-004 for Jina.
- **Alternatives considered**: `PyGithub` — yes, less code, but introduces a transitive web of deps for one endpoint. `aiohttp` — rejected; F-001 is sync top-to-bottom and async adds noise.

### AD-7: gcloud scripts now, Terraform later
- **Choice**: `scripts/provision-spike-secrets.sh` and `scripts/provision-spike-iam.sh` are idempotent bash scripts using `gcloud` + `gh`. Terraform is explicitly **out of scope for F-001** (lands in F-007).
- **Rationale**: For a spike, bash is faster to iterate on and easier to debug. Idempotency comes from `gcloud secrets create ... || gcloud secrets versions add ...` patterns and `gcloud projects add-iam-policy-binding` being naturally idempotent.
- **Alternatives considered**: Terraform now — F-001's IAM surface is small (one SA, three secrets, three IAM bindings); Terraform's cost would dominate.

### AD-8: Run ID format
- **Choice**: `runId = spike-{YYYY-MM-DD}-{shortId}` where `shortId = first 8 chars of uuid4().hex`. Date prefix lets `gcloud logging read` filter by date. The `spike-` prefix isolates F-001 runs from real runs the moment F-003 lands.
- **Rationale**: Idempotency by date (constitution §2 principle 7) is not yet required for the spike since each invocation is manual — but matching the prefix shape now avoids a migration in F-003.

### AD-9: Imagen prompt is a literal string in code, not from `/generate`
- **Choice**: Hardcode the prompt: `"Cartoon owl mascot 'Le Veilleur' — navy plumage, large amber eyes, friendly Pixar 3D style, looking curiously to the side, soft studio lighting, 16:9 aspect ratio, white background."` Place in `minion/src/minion/spike/imagen.py` as a module-level constant `SPIKE_IMAGEN_PROMPT`.
- **Rationale**: The spike does not exercise prompt-generation. A safe, vetted, mascot-only prompt minimizes Imagen moderation risk (PRD §10 R2). The prompt also matches `DESIGN.md` §0 mascot description so the placeholder is visually on-brand.
- **Alternatives considered**: Random / each-run prompt — rejected; adds variance the spike doesn't need.

### AD-10: GitHub commit path layout matches the real pipeline
- **Choice**: Commit to `veilleur/site/public/images/spikes/{YYYY-MM-DD}.webp` (note: `spikes/`, not `posts/`). Same parent path as the real F-006 publish target so the layout under `allienna.github.io/veilleur/site/public/images/` is consistent.
- **Rationale**: Keeps spike artifacts visible under the same tree but quarantined in their own `spikes/` subdir — never confused for real published images. Idempotent overwrite by date is preserved within the `spikes/` folder.

## Affected Files

### New Files

| File | Purpose |
|---|---|
| `minion/pyproject.toml` | `uv`-managed Python 3.12 project; deps: `google-api-python-client`, `google-genai`, `google-cloud-firestore`, `google-cloud-secret-manager`, `pydantic`, `python-json-logger`, `httpx`, `pillow`, `click`. Dev deps: `ruff`, `pyright`. |
| `minion/uv.lock` | Lockfile committed (constitution §6). |
| `minion/Dockerfile` | Multi-stage build (AD-4). `--platform linux/amd64` documented in header comment. |
| `minion/.dockerignore` | Excludes `.venv`, `__pycache__`, `*.pyc`, `tests/`, `.pytest_cache`. |
| `minion/src/minion/__init__.py` | Empty marker — establishes the package root F-003 inherits. |
| `minion/src/minion/spike/__init__.py` | Empty marker. |
| `minion/src/minion/spike/__main__.py` | `python -m minion.spike` entry. Click app exposing `run` and `claude-probe`. |
| `minion/src/minion/spike/logging.py` | JSON logger configuration (AD-3). Exports `get_logger(run_id)`. |
| `minion/src/minion/spike/models.py` | `SpikeRunRecord` Pydantic model (AD-2). |
| `minion/src/minion/spike/secrets.py` | Thin Secret Manager helper: `get(name) -> str`, `require(name)` raises `MissingSecretError`. Asserts `ANTHROPIC_API_KEY` is **not** in env (constitution §2 principle 2). |
| `minion/src/minion/spike/gmail.py` | `count_unread_last_24h() -> int`. Uses `gmail-oauth-refresh-token` secret. |
| `minion/src/minion/spike/imagen.py` | `generate_placeholder() -> bytes`. Hardcoded `SPIKE_IMAGEN_PROMPT` (AD-9). One retry on moderation. |
| `minion/src/minion/spike/firestore.py` | `write_run(record: SpikeRunRecord) -> None`. Writes at `runs/{record.run_id}`. |
| `minion/src/minion/spike/github.py` | `commit_image(date: str, bytes_: bytes) -> str`. Returns commit SHA. Uses GitHub Contents API directly via `httpx`. |
| `minion/src/minion/spike/claude_probe.py` | Subprocess `claude -p --permission-mode bypassPermissions "Output the word PONG and nothing else."`; asserts stdout starts with `PONG`. |
| `scripts/provision-spike-secrets.sh` | Idempotent bash. Creates five secrets in `veilleur-app` project. Refuses to proceed if `gcloud config get-value project` ≠ `veilleur-app`. |
| `scripts/provision-spike-iam.sh` | Idempotent bash. Creates `spike-minion-sa`, grants three roles (per-secret `secretmanager.secretAccessor`, project `aiplatform.user`, project `datastore.user`). |
| `scripts/spike-local.sh` | `make spike-local` equivalent. Runs `docker run --platform linux/amd64 -v ~/.config/gcloud:/root/.config/gcloud ... veilleur-spike:dev run --date $(date +%F)`. |
| `scripts/spike-cloud.sh` | Builds image, pushes to Artifact Registry (`europe-west1-docker.pkg.dev/veilleur-app/minion/spike:dev-$(git rev-parse --short HEAD)`), creates/updates the Cloud Run Job, executes once, prints the runId. |
| `minion/README.md` | AC-9 deliverable. Documents human prerequisites in order: `gcloud auth login` → `gcloud config set project veilleur-app` → `claude setup-token` → GitHub PAT issuance UI → run `provision-spike-secrets.sh` → run `provision-spike-iam.sh` → `scripts/spike-local.sh` → `scripts/spike-cloud.sh`. |
| `.gitignore` (root) | `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.DS_Store`, `*.log`, `.env`, `.env.local`. |

### Modified Files

| File | Change |
|---|---|
| `specs/001-hello-veilleur-spike/spec.md` | Status `Draft` → `Approved`. OQ-1/OQ-2/OQ-3/OQ-5 resolution notes appended to the Open Questions section. |
| `specs/roadmap.md` | F-001 status `Specifying` → `Planning`. |

## Implementation Phases

### Phase 1 — Python workspace + structured logging + models (foundation)
**Goal**: Get `python -m minion.spike --help` working with the right shape of subcommands and a working JSON logger.

- Create `minion/pyproject.toml` with deps + dev-deps + `tool.ruff` + `tool.pyright` config blocks (lifts conventions from constitution §4 even though `CLAUDE.md` doesn't exist yet — F-002 will canonicalize).
- `uv sync` to produce `uv.lock`. Commit lockfile.
- Implement `spike/logging.py`, `spike/models.py`, `spike/__main__.py` (Click app skeleton with stub subcommands).
- Verify locally: `uv run python -m minion.spike --help` lists `run` and `claude-probe`.

### Phase 2 — External clients, no orchestration (vertical slices)
**Goal**: Each of the five external systems has a working, isolated module that can be invoked from a REPL against the real project.

- `spike/secrets.py` — Secret Manager helper. Includes the `ANTHROPIC_API_KEY` absence assertion. Unit-tested with a manual `python -c` against the live project.
- `spike/gmail.py` — `count_unread_last_24h()`. Local smoke test: returns an int ≥ 0.
- `spike/imagen.py` — `generate_placeholder()`. Local smoke test: returns bytes; manual visual check (open the .webp).
- `spike/firestore.py` — `write_run(record)`. Local smoke test: read back via `gcloud firestore documents read`.
- `spike/github.py` — `commit_image(date, bytes_)`. Local smoke test: writes to `allienna.github.io` and the commit shows up in the GitHub UI.
- `spike/claude_probe.py` — subprocess call. Local smoke test: runs against the operator's host `claude` install (verifies the code is right; the deployed test in Phase 4 is the real R1 gate).

### Phase 3 — Orchestration + Dockerfile + local invocation (vertical assembly)
**Goal**: A single `uv run python -m minion.spike run --date 2026-05-19` invocation completes all four steps end-to-end against the real `veilleur-app` project.

- Wire the four steps in `__main__.py:run()` in order: Gmail → Imagen → Firestore → GitHub. Each step logs a JSON line with `step`, `status`, `duration_ms`. Failures exit non-zero with the structured error line.
- Hardcode AD-9's `SPIKE_IMAGEN_PROMPT`. Wire one retry on moderation rejection (mark `imagen_status: "blocked"` if both attempts fail, continue to step 3 → 4 — spec error-scenarios table).
- Write `minion/Dockerfile` (AD-4). Build locally with `--platform linux/amd64`. Verify `docker run` reproduces the local Python invocation result.
- Document the platform flag in `minion/README.md`.

### Phase 4 — Cloud deployment + R1 close-out (the load-bearing milestone)
**Goal**: A `gcloud run jobs execute` produces the same Firestore + GitHub artifacts as Phase 3, **and** `claude-probe` returns `PONG` inside the deployed container.

- `scripts/provision-spike-secrets.sh` — implement + dry-run. Real secret values supplied manually outside the script. The script should `gcloud secrets describe` each secret and refuse to overwrite unless `--force` is passed. **Special handling for OQ-3**: the script must print a clear "Issue the GitHub PAT at <URL> and `gcloud secrets versions add github-pat-allienna-pages --data-file=-` before continuing" message if the secret has no version.
- `scripts/provision-spike-iam.sh` — implement + run. Verify with `gcloud iam service-accounts get-iam-policy spike-minion-sa@veilleur-app.iam.gserviceaccount.com`.
- `scripts/spike-cloud.sh` — push image to Artifact Registry, create the Cloud Run Job with the right SA, region `europe-west1`, no Scheduler binding. Execute one run.
- **Run `claude-probe` inside the deployed container first** (the AC-5 / R1 gate). Only if PONG comes back, proceed to the full `run` invocation.
- Verify AC-2, AC-3, AC-4 by reading Firestore + GitHub commit history.
- If the 1.5-day timebox is reached without AC-5 green, escalate per OQ-5 resolution. Document the escalation decision in `specs/001-hello-veilleur-spike/escalation.md` (only if it happens).

### Phase 5 — README + finalization
**Goal**: AC-9 satisfied; `review.md` can be written.

- Write `minion/README.md` covering the full setup-to-run path.
- Update `specs/001-hello-veilleur-spike/spec.md` to `Approved`.
- Update `specs/roadmap.md` F-001 status to `Planning`.

## Test Strategy

No formal test suite for F-001 — the acceptance gate is **the live end-to-end run**, not coverage (spec out-of-scope item). However, each phase has explicit smoke-test instructions:

- **Mocking approach**: None. The spike's job is to exercise real systems. Mocking defeats R1/R9 de-risking.
- **Happy paths**: AC-2 + AC-3 + AC-4 + AC-5 are the four happy-path assertions, demonstrated by reading the produced artifacts (Firestore docs, GitHub commits, `claude-probe` exit code).
- **Error scenarios**: Exercised opportunistically — the spike intentionally fails-fast on missing secrets / wrong env / moderation rejection. The first run rarely succeeds end-to-end; debugging each failure **is** the de-risking work.
- **Edge cases**:
  - `ANTHROPIC_API_KEY` set in dev env — `secrets.py` must refuse to proceed; **manually test this** by `ANTHROPIC_API_KEY=foo uv run python -m minion.spike run ...` and assert non-zero exit.
  - Apple Silicon build without `--platform linux/amd64` — must fail with a clear error documented in README troubleshooting.
  - Imagen moderation rejection — covered by the one-retry in Phase 3; verify by temporarily swapping the prompt for something flagged.
- **Test for F-003 inheritance**: F-003 will eventually replace this code, so do **not** write tests against the spike modules — the tests would only need to be rewritten. F-002 onwards is when test scaffolding actually lands.

## Risk & Complexity

- **Estimated complexity**: **Medium** — code-wise this is simple (~400 LOC across 8 Python files + 4 scripts). Difficulty is concentrated in the IAM/auth chain debugging.
- **Key risks**:
  - **R1 (High)** — Claude OAuth in headless container. Highest-confidence way to fail is a non-obvious env-var or filesystem requirement of `@anthropic-ai/claude-code` that doesn't survive the container boundary. Mitigation: Phase 4 runs `claude-probe` **before** the full chain so we discover this independently.
  - **R9 (Med)** — IAM chain. Most-likely failure point is Workload Identity binding for the Cloud Run Job → service account. Mitigation: AD-5's "same code path local + cloud" lets us compare a working ADC run against a broken WI run side-by-side.
  - **OQ-3 (Unknown)** — GitHub PAT may not be issued yet. Mitigation: provisioning script fails closed with a clear error.
  - **Container platform mismatch** — Apple Silicon dev → linux/amd64 Cloud Run. Mitigation: README + Dockerfile header comment + `make spike-local` always passes `--platform linux/amd64`.
  - **Cost overrun during debugging** — Imagen calls are ~0.02€/each. A debug loop of 50 iterations is ~1€ — acceptable. Vertex idle is zero. Cloud Run Jobs per-second billing while debugging won't dent the 30€/mo cap.
- **New dependencies**: `google-api-python-client`, `google-genai`, `google-cloud-firestore`, `google-cloud-secret-manager`, `pydantic`, `python-json-logger`, `httpx`, `pillow` (for converting Imagen output to webp if SDK doesn't already do so), `click`. Dev: `ruff`, `pyright`. All standard, all on PyPI, all maintained by Google or the Python ecosystem.
- **External dependencies needing human action before/during the spike**: gcloud login, GCP project enabled with billing, Vertex AI enabled, Firestore Native created in `europe-west1`, Gmail OAuth refresh token (one-time local OAuth flow), Anthropic `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, GitHub fine-grained PAT for `allienna/allienna.github.io` (OQ-3).
