# Project Constitution

> Non-negotiable principles for **Veilleur-app**. Reject any PR that violates these.

## 1. Project Context

Veilleur-app is a mono-tenant, mono-user automated tech-watch pipeline: a Stripe-style "Minion" (one-shot Cloud Run Job orchestrating Python + `claude -p`) that publishes a daily synthesis article to a public Astro site, and a PWA for supervision and LinkedIn copy-paste publishing. It replaces the author's fragile local v1 (n8n) with an unattended, cloud-native daily pipeline he actually relies on for his personal tech watch. The project originated as a demo artefact for the DevLille 2026 talk on spec-driven development; the talk has since happened (without this app in the live demo) and the project now continues as ongoing personal infrastructure — reliability and low running cost matter more than legibility to an outside audience, though the spec-driven build process (PRD, constitution, roadmap, specs/, git history) remains how this project is built.

## 2. Non-Negotiable Principles

1. **Single allowed identity.** Only the hardcoded operator email may read or write Firestore documents, call `trigger-api`, or perform any privileged action. The PWA shell is a public static SPA — what is gated is the **data and the actions**, not the bundle download. Defense-in-depth: Firestore Security Rules + trigger-api JWT verification (`email_verified == true`). The PWA client check is UX only, never the security boundary.
2. **OAuth-by-default Anthropic auth.** `ANTHROPIC_API_KEY` is **absent from env by default**. The container authenticates via `CLAUDE_CODE_OAUTH_TOKEN`. The API-key fallback exists in Secret Manager but is mounted only by explicit, manually-edited deployment, never automated.
3. **No secrets in source.** All credentials live in GCP Secret Manager and are accessed via SA IAM. Never commit secrets, `.env` files with real values, or service-account JSON keys.
4. **Transformative use only.** No source passage is reproduced wholesale. Direct quotes ≤30 words per source, and max **1 substantial (≥6-word) direct quote** per source — shorter spans (product names, labels, emphasis) are not copyrightable excerpts and do not count toward the limit. A quote counts against a source only when it appears verbatim in **exactly one** source; phrasing shared by ≥2 sources is common reporting, not single-source over-quoting. Wholesale reproduction = a verbatim run of **≥20 normalized tokens** shared with a source (quoted spans excluded). Every cited fact attributes its source by name and links to its URL. Paywall content (scraper output markers) is excluded. Enforced by the deterministic post-validator in `/generate`; the thresholds (`MAX_QUOTE_WORDS`, `MAX_QUOTES_PER_SOURCE`, `MIN_COUNTED_QUOTE_WORDS`, `WHOLESALE_NGRAM`) live in `minion/config.py` and were recalibrated against real multi-source burn-in (F-013) so the guard targets substantial verbatim copying, not proper nouns or stock phrasing.
5. **Hard caps per run.** 50 newsletters fetched, 100 links scraped, 500k input tokens, 30k output tokens, 1 image generated, 10k-word article max, 3000-char LinkedIn post. Exceeding any cap = run failure, not silent truncation.
6. **20-minute hard run timeout.** No Cloud Run Job invocation runs longer.
7. **Idempotent runs.** Replaying a run for date `D` overwrites prior outputs cleanly — never duplicates an article, image, or Firestore document.
8. **Concurrency guard.** Firestore lock prevents simultaneous runs; second invocation aborts as `aborted: already_running`.
9. **Observable steps.** Every Minion step writes `runs/{runId}/steps/{stepName}` with `status`, `started_at`, `ended_at`, `error?` to Firestore. No silent failures.
10. **Budget kill-switch armed at all times.** 30€/mo billing alert wired to Pub/Sub → Cloud Function that disables Cloud Scheduler at 100%. Disabling the kill-switch requires a PR.
11. **No third-party PII.** Newsletter sender denylist enforced. No analytics, no tracking, no third-party cookies.

## 3. Tech Stack

| Component | Choice | Locked? |
|---|---|---|
| Minion runtime | Cloud Run Job (Python 3.12 + Node 20 + git + `@anthropic-ai/claude-code`) | **Locked** |
| Orchestrator | Python 3.12 + Pydantic | **Locked** |
| Agentic step | `claude -p "/generate"` over the versioned command vendored at `minion/.claude/commands/generate.md` (ported from the legacy Veilleur v1 app; copied into the Minion image) | **Locked** |
| LLM | Claude Code Max 5× via OAuth; API-key fallback only | **Locked** |
| Image gen | Vertex AI (`imagen-4.0-fast-generate-001`), IAM-only | **Locked** |
| Public site | Astro on `allienna.github.io/veilleur` (separate repo) | **Locked** |
| PWA | React 18 + TypeScript + Vite + `vite-plugin-pwa` + Tailwind + shadcn/ui | **Locked** |
| PWA hosting | Firebase Hosting | **Locked** |
| Auth | Firebase Auth (Google sign-in) | **Locked** |
| State | Firestore (Native mode) + real-time listeners | **Locked** |
| Push | Web Push (VAPID) + service worker | **Locked** |
| Scraping | Local extraction (`httpx` + `trafilatura`) — was Jina Reader, swapped in F-015 | Flexible |
| `trigger-api` runtime | Cloud Run service vs Cloud Function 2nd gen | Flexible |
| IaC | Terraform preferred, gcloud scripts acceptable | Flexible |
| `shared/` types | JSON Schema → codegen vs hand-sync TS/Python | Flexible |

## 4. Coding Standards

- **Python**: Pydantic models for every Minion I/O boundary (Gmail payloads, scrape output, `/generate` outputs, Firestore docs). `uv` as package manager. `ruff` for lint + format.
- **TypeScript**: `strict: true`, no `any`, no `// @ts-ignore`. ESLint + Prettier.
- **Module shape (Minion)**: one file per step under `minion/src/minion/` (`gmail.py`, `scraper.py`, `imagen.py`, …). Each step takes a typed input, returns a typed output, writes its Firestore state. No cross-step state in globals.
- **Slash commands are production code**: `/generate` is a Veilleur-domain command vendored in this repo at `minion/.claude/commands/generate.md` (ported from the legacy Veilleur v1 app) and copied into the Minion image. The runtime literally executes this versioned spec — treat it as production code, not a free-floating script: changes go through a normal PR + review here, and its output contract is enforced by the deterministic validators in `minion/src/minion/generate/`. (The generic spec-workflow commands — `/specify`, `/plan`, `/tasks`, … — come from the separate [`allienna/claude-feature-flow`](https://github.com/allienna/claude-feature-flow) plugin; `/generate` is **not** one of them.)
- **Firestore access in PWA**: typed accessors only, no inline `doc()` calls inside React components.
- **Logging**: structured logs only (`runId`, step, level). No `print` / `console.log` in committed code.
- **Comments**: only when the WHY is non-obvious. Don't restate the code.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, scoped with feature number when applicable).

## 5. Quality Gates

Every PR must pass ALL of these before merge:

- [ ] `ruff check minion/ trigger-api/` (if Python) — no warnings.
- [ ] `ruff format --check minion/ trigger-api/` — formatted.
- [ ] `pyright minion/ trigger-api/` — no errors.
- [ ] `pnpm lint` and `pnpm typecheck` for `pwa/` and any TS package.
- [ ] Unit tests for deterministic Minion nodes (with mocked external APIs) pass.
- [ ] CI grep test confirms the allowed-email constant is identical in `firestore.rules`, `trigger-api/src/auth.ts`, `pwa/src/config.ts`.
- [ ] No new secrets in source; no `.env` with real values committed.
- [ ] Lockfiles (`uv.lock`, `pnpm-lock.yaml`) updated when deps change.
- [ ] If the PR touches a feature with a track, `specs/{NNN}-…/review.md` verdict is "Ready to merge" or "Pass with notes".

## 6. Compliance & Security

- **Auth**: Firebase Auth (Google sign-in). Authorisation = `request.auth.token.email == "<allowed>" && request.auth.token.email_verified == true` enforced server-side (Firestore Rules + trigger-api).
- **Secrets**: Secret Manager only; SA IAM bindings (`roles/secretmanager.secretAccessor`) on a per-secret basis. No service-account JSON keys; ADC + IAM only.
- **Transport**: HTTPS-only end to end. No HTTP fallback. PWA served from Firebase Hosting under a `*.web.app` or custom HTTPS domain.
- **Dependencies**: lockfiles committed; no unpinned deps. New dependencies are reviewed in the PR description.
- **Data persistence**: Firestore is the single source of truth for run state, articles, LinkedIn drafts, push subscriptions. No PII beyond the operator's own data.
- **Compliance frameworks**: none triggered (mono-user, no payment, no health). Out-of-scope per PRD §11.
