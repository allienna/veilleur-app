# Veilleur-app — Product Requirements Document

**Last updated**: 2026-05-10
**Status**: Draft (awaiting approval)
**Author**: Aurélien Allienne ([@allienna](https://github.com/allienna))

## 1. Overview

### Problem Statement
The current v1 of Veilleur depends on a local n8n containerised via Colima and a manual `/generate` trigger inside Claude Code on the author's Mac. This is fragile (machine must be on, daemon must survive reboot) and unusable on the go. It also mixes low-code orchestration (n8n) and custom code in a way that is pragmatic but not architecturally exemplary, undermining its use as a demonstration artefact for the DevLille 2026 talk *"Le vibe coding est mort, vive le spec coding"*. The talk requires an artefact that embodies spec coding at **two** levels: at construction-time (PRD → constitution → roadmap → specs → implementation, with git history as proof) and at runtime (a one-shot agent — a "Minion" in the Stripe sense — whose runtime literally executes a versioned slash-command spec).

### Goals & Success Metrics

**At DevLille (2026-06-11/12) — hard targets:**
- Pipeline runs autonomously daily for ≥3 weeks pre-talk (production live by 2026-05-20).
- ≥90% of days produce a publishable article without human intervention.
- ≥30 articles published on `allienna.github.io/veilleur`; ≥25 shared on LinkedIn (shared/published ratio = a posteriori quality proxy).
- PWA installed and used daily on iPhone + Mac.
- All `claude-feature-flow` phases (`/prd` → `/merge`) traversed ≥1×, with git history and `specs/` as evidence.
- ≥1 feature track reserved for live `/specify` or `/implement` demo on stage.
- Repo quality: `README.md`, `CLAUDE.md`, `ROADMAP.md`, `PRD.md`, `DESIGN.md`, `specs/` — defensible as architectural exemplar.
- Costs: GCP ≤ 5€/mo · Claude LLM 0€ via Max 5× (CLAUDE_CODE_OAUTH_TOKEN), 30€/mo hard cap on API key fallback · Imagen ~0.60€/mo.

**At 6 months (2026-12-31):**
- v1 fully decommissioned (n8n stopped, data archived/migrated).
- Pipeline ≥60 consecutive autonomous days.
- ≥1 extension shipped (e.g., NotebookLM Minion, source-cards Minion) as extensibility proof.
- ≥1 technical blog post or second talk fed by the project.

### Target Users
| Persona | Description | Primary needs |
|---------|-------------|---------------|
| **Aurélien Allienne (operator + reader)** | GenAI Architect, sole production user. Reads ~10 tech newsletters/day. Morning routine: open PWA on iPhone (commute/café) → read overnight article → copy LinkedIn post → paste into LinkedIn iOS app. PWA gated by single-Google-account auth. | Trustworthy autonomy · Mobile-first supervision · Frictionless 1-tap publish · Daily readable digest |
| **DevLille 2026 audience (evaluator, non-user)** | ~200–400 devs, tech leads, GenAI practitioners attending the June 2026 talk. Not system users, but the project must be **legible and defensible** as an architectural exemplar. | Clean repo (`CLAUDE.md`, `ROADMAP.md`, `specs/`, git history) · Clear cloud-native architecture · Credible spec-driven narrative |

## 2. User Stories

### A. Minion Pipeline
- As the operator, I want the pipeline to ingest unread newsletters from the dedicated Gmail inbox over the last 24h so that no manual mailbox triage is needed.
- As the operator, I want each linked article scraped to clean Markdown by an in-container extractor so that source extraction is deterministic, paywall-aware, and free of an external rate limit (F-015; was Jina Reader — see §5 amendment).
- As the operator, I want Claude to detect the day's dominant theme, draft a transformative synthesis article, write the image prompt, and write the LinkedIn catch-up post in a single agentic call so that all generative steps share one context.
- As the operator, I want an Imagen 4 Fast illustration of *Le Veilleur* (navy owl, amber eyes, Pixar style, 16:9) staged in the day's theme so that every published article has a coherent visual identity.
- As the operator, I want the article and image committed to the public Astro repo automatically so that publication requires zero human action.

### B. PWA Reading
- As the operator, I want to read today's article and the last ~30 articles in the PWA so that my daily reading happens in a single iOS-native-feeling surface.

### C. PWA LinkedIn Share
- As the operator, I want a single tap to copy the LinkedIn post to clipboard and a second tap to save the hero image to Photos so that I can post on LinkedIn iOS in under 30 seconds.

### D. PWA Supervision
- As the operator, I want to observe a pipeline run in real-time (current step, duration, errors, tokens, cost) so that I can supervise from anywhere.
- As the operator, I want to browse the last ~30 runs with their final status, duration, and LLM cost so that I can spot regressions.
- As the operator, I want to replay a failed run from the PWA so that I can recover a missed day without leaving my phone.

### E. PWA Trigger & Notifications
- As the operator, I want a "Run now" button in the PWA so that I can trigger a run manually (essential for live demo and recovery).
- As the operator, I want an iOS push notification when a run finishes so that I know the article is ready before opening the app.

### F. PWA Auth
- As the operator, I want Google sign-in restricted to my email so that no one else can access run state, drafts, or triggers — even if they discover the URLs.

### G. Spec-coding Artefact
- As the DevLille audience, I want to read the `specs/`, `ROADMAP.md`, `CLAUDE.md`, and git history of this repo and find a coherent, defensible spec-driven narrative so that the talk's thesis is materially proven.

## 3. Functional Requirements

### A. Minion Pipeline (must-have)

#### FR-A1: Daily autonomous trigger
Cloud Scheduler fires a single cron job daily at 06:00 Europe/Paris (TBD in `/plan`) that invokes the Cloud Run Job. A separate trigger-api micro-service exposes manual triggering for the PWA.
**Acceptance criteria:**
- [ ] Scheduler-fired runs execute without human action 7/7 days.
- [ ] Manual trigger from PWA produces an identical run shape (same Firestore documents, same outputs).
- [ ] Concurrent runs are prevented by a Firestore lock (`aborted: already_running`).

#### FR-A2: Hybrid orchestration (deterministic + agentic)
A Python orchestrator runs nine steps: Gmail pull → scrape (local extraction) → schema validation → context assembly → `claude -p /generate` → output validation → Imagen 4 Fast → GitHub commit → Firestore + web push. Each step writes its state to Firestore for live supervision.
**Acceptance criteria:**
- [ ] Each step writes `runs/{runId}/steps/{stepName}` with `status`, `started_at`, `ended_at`, `error?`.
- [ ] The agentic step invokes `claude -p` with `--permission-mode bypassPermissions`; `ANTHROPIC_API_KEY` is **absent from env by default** (OAuth-only via `CLAUDE_CODE_OAUTH_TOKEN`). The API-key fallback (§8 `anthropic-api-key-fallback`) is an explicit, manually activated mode, never the default path.
- [ ] Output validation enforces: Astro frontmatter complete, LinkedIn post ≤3000 chars, image prompt ≤1000 chars, theme in known list or `"other"`.
- [ ] Validation failure triggers agentic retry (max 2 attempts) with the validation error fed back as input.

#### FR-A3: Copyright-safe synthesis
The `/generate` slash-command spec (`minion/.claude/commands/generate.md`) encodes transformative-use rules. A deterministic post-validator enforces them.
**Acceptance criteria:**
- [ ] Direct quotes ≤30 words per source, max 1 quote per source.
- [ ] Each idea/figure attributes its source by name and links to source URL.
- [ ] No paragraph reproduces a source paragraph wholesale (n-gram overlap check).
- [ ] Paywall content (detected via scraper output markers — recalibrated for the local extractor in F-015) is excluded.

#### FR-A4: Auto-publish to Astro repo
The Minion commits `site/src/content/posts/YYYY-MM-DD-<slug>.md` and `site/public/images/posts/YYYY-MM-DD.webp` to the existing `allienna.github.io` repo via the GitHub Contents API (fine-grained PAT scoped to that repo, `contents:write` only).
**Acceptance criteria:**
- [ ] Commit succeeds idempotently — replaying a run for the same date overwrites prior content.
- [ ] GitHub Pages deployment is triggered automatically (out-of-SLO, best-effort).

### B–F. PWA (must-have unless noted)

#### FR-B1: Reading surface
PWA renders today's article + last 30 articles, reading from Firestore (not the public Astro site) for low-latency access on iPhone.
**Acceptance criteria:**
- [ ] Today's article visible within ≤2s LCP on iPhone 4G cold start.
- [ ] Service-worker-cached reload ≤500ms.

#### FR-C1: Two-tap LinkedIn share
Per iOS clipboard limitations, two distinct actions: "Copy post" (text → clipboard) and "Save image" (PNG → Photos).
**Acceptance criteria:**
- [ ] Copy action puts the LinkedIn post text on the iOS clipboard with no confirmation dialog.
- [ ] Save action triggers iOS Photos save (Web Share API or `<a download>`).

#### FR-D1: Live supervision
PWA subscribes to `runs/{currentRunId}` via Firestore listeners; UI updates within 2s of any step state change.
**Acceptance criteria:**
- [ ] Current step name, elapsed duration, and any error visible in real time.
- [ ] Token count and cost-to-date visible during the run.

#### FR-D2: Run history
List of last 30 runs with status, duration, LLM cost, theme.
**Acceptance criteria (must-have):** ≥7 most recent runs visible.
**Acceptance criteria (nice-to-have):** Up to 30 runs; manual replay from a failed run.

#### FR-E1: Manual trigger
"Run now" button calls the trigger-api micro-service with the operator's Firebase Auth JWT.
**Acceptance criteria:**
- [ ] Button is disabled while a run is in progress for today.
- [ ] On success, PWA navigates to the live supervision view with the new `runId`.

#### FR-E2: iOS push notifications
Web Push (VAPID) sent when a run completes (success / `success_with_warnings` / failure / `skipped: no_sources`).
**Acceptance criteria:**
- [ ] Notification reliably delivered on iOS 16.4+ when PWA is installed to home screen.
- [ ] No notification sent for `skipped: no_sources` (avoid weekend/holiday noise).

#### FR-F1: Mono-tenant auth (defense-in-depth)
- Firestore Security Rules: `request.auth.token.email == "<allowed>" && request.auth.token.email_verified == true`.
- trigger-api verifies the Firebase Auth JWT and the email claim.
- PWA does a soft client-side check (UX only).
**Acceptance criteria:**
- [ ] All three checks reject any non-allowed email.
- [ ] The allowed email is hardcoded in `firestore.rules`, `trigger-api/src/auth.ts`, and `pwa/src/config.ts`, with the invariant documented in `CLAUDE.md`.

### G. Spec-coding artefact (must-have)

#### FR-G1: Reserved live-demo track
A non-started feature track is reserved by 2026-06-05, with `specs/feature-XXX/` stub created.
**Acceptance criteria:** Folder exists, contains placeholder `spec.md`, will be exercised live on stage.

### Nice-to-have (cuttable)
- PWA history beyond 7 days.
- Replay UI (manual replay can be invoked via direct `gcloud run jobs execute` if absent).
- Cross-newsletter trends detection.
- Theme filtering UI on Astro site.
- LLM cost dashboard in PWA.
- PWA offline mode for past articles.

## 4. Non-Functional Requirements

### Performance
| Dimension | Target | Hard ceiling |
|---|---|---|
| Total run duration (Cloud Run Job, excl. GH Pages deploy) | ≤8 min | 20 min (Job timeout) |
| Gmail + scrape ingestion stage | ≤3 min | 5 min |
| Claude `/generate` agentic call | ≤4 min | 8 min |
| Imagen 4 Fast image generation | ≤30s | 90s |
| GitHub commit | ≤10s | 60s |
| PWA cold-start LCP on iPhone 4G | ≤2s | 3s |
| PWA SW-cached reload | ≤500ms | 1s |
| PWA Time-to-Interactive (cold) | ≤3s | 5s |
| Firestore live-supervision latency | ≤2s | 5s |
| GitHub Pages deploy (post-push) | 30–90s typical | out-of-SLO |

### Reliability
- Pipeline ≥90% success rate (publishable article without intervention) on a rolling 21-day window.
- Daily idempotency: replaying a run for date `D` overwrites prior outputs without duplicates.
- No data loss: all run artefacts (article markdown, image bytes, LinkedIn draft) are persisted in Firestore even when GitHub push fails, enabling manual recovery.

### Scalability
Hard caps per run (cost + quality guardrails):
- Newsletters fetched: 50.
- Links scraped: 100.
- `/generate` input tokens: 500k.
- `/generate` output tokens: 30k.
- Images generated: 1.
- Article length: 10k words.
- LinkedIn post length: 3000 chars (LinkedIn's own limit).

No horizontal scale required — single-user, single-run-per-day product. Monthly extension to a second Minion (NotebookLM, source-cards) reuses the same blueprint without architectural change.

## 5. Architecture & Tech Stack

### System Architecture

```
┌──────────────┐     06:00 Europe/Paris     ┌──────────────────────┐
│   Cloud      │ ──────────────────────────▶│  Cloud Run Job       │
│  Scheduler   │       (run.invoker SA)     │  (the Minion)        │
└──────────────┘                            │                      │
                                            │  Python orchestrator │
┌──────────────┐    Firebase Auth JWT       │  + claude -p CLI     │
│     PWA      │ ──┐                        │  + Node + git        │
│ (Firebase    │   │  POST /trigger          │                      │
│   Hosting)   │ ──┼─▶┌────────────────┐    │  9 steps:            │
│              │   │  │  trigger-api   │ ──▶│  Gmail → scrape →    │
│              │ ◀─┘  │  Cloud Run svc │    │  /generate → Imagen  │
└──────────────┘ Firestore listeners  └──┘  │  → GitHub → Firestore│
       │                                    │  → web push          │
       │ read articles + run state          └──────────┬───────────┘
       ▼                                               │
┌──────────────┐  ◀─────── writes ──────────────────── │
│  Firestore   │                                       │
└──────────────┘                                       │
                                                       │ commit
                                                       ▼
                                            ┌──────────────────────┐
                                            │ allienna.github.io   │
                                            │ (Astro site)         │
                                            │ ─▶ GitHub Pages      │
                                            └──────────────────────┘

Budget kill-switch: Cloud Billing → Pub/Sub → Cloud Function → disable Scheduler.
```

### Tech Stack
| Component | Choice | Rationale |
|-----------|--------|-----------|
| Minion runtime | Cloud Run Job (multi-stage Python 3.12 + Node 20 + git + `@anthropic-ai/claude-code`) | One-shot semantics, no idle cost, IAM-native auth. |
| Orchestrator | Python 3.12, Pydantic for output schemas | Deterministic I/O layer; ecosystem strength for Gmail / Vertex AI / GitHub APIs. |
| Agentic step | `claude -p "/generate"` against versioned `.claude/commands/generate.md` | Runtime literally executes a spec — incarnates the talk thesis. |
| LLM | Claude Code Max 5× via `CLAUDE_CODE_OAUTH_TOKEN`; Anthropic API key fallback | Cost target 0€; hard 30€/mo cap if forced to fallback. |
| Image | Imagen 4 Fast (`imagen-4.0-fast-generate-001`) via Vertex AI (IAM, no key) | All-on-GCP coherence, ~0.02$ / image. |
| Site (public) | Astro + GitHub Pages, hosted in **separate** `allienna.github.io` repo under `veilleur/` path | Pre-existing showcase, kept untouched structurally. |
| PWA | React 18 + TypeScript + Vite + `vite-plugin-pwa` + Tailwind + shadcn/ui | Reuses operator's existing stack (Trivium, TCFT) — zero learning curve. |
| PWA hosting | Firebase Hosting (`veilleur-app.web.app`) | Native pairing with Firebase Auth + Firestore, unified IAM. |
| Auth | Firebase Auth (Google sign-in), single allowed email | Mono-tenant, defense-in-depth at Firestore Rules + trigger-api. |
| State store | Firestore (Native mode) | Real-time listeners drive live supervision; same project as Auth. |
| trigger-api | Cloud Run service (~50 LOC, Node or Python — TBD `/plan`) | Verifies JWT, invokes Cloud Run Job with payload, returns `runId`. |
| Push | Web Push API (VAPID) + service worker | Native iOS 16.4+ support when PWA is home-screen installed. |
| Scraping | **Local extraction** — `httpx` fetch + `trafilatura` (in-container; no external service) | Jina free tier was found to rate-limit below the pipeline's needs (see amendment ↓). Local extraction has no quota/key/throttle. |
| Repo layout | Monorepo `veilleur-app` (this repo) — see §8 below | Single source of truth for Minion + PWA + specs; Astro site stays in `allienna.github.io`. |

> **Amendment 2026-06-04 (scraping engine).** The original choice — Jina Reader free tier (no key) — was falsified during F-013 burn-in: the first production runs hard-failed the ≥50%/≥5 ingestion gate at **17/46** then **1/31** sources OK, with **0 paywalled and all failures HTTP-level** — the free-tier rate-limit signature, not a thin-news day. A single run of up to 100 URLs across a bounded worker pool bursts past the free per-minute limit. Scraping is rated **Flexible** in `specs/constitution.md`, so the engine is swappable without violating a principle. Decision: replace Jina with in-container `httpx` + `trafilatura` extraction (no external rate limit). Tracked in **F-015** (Ingestion resilience); the port abstraction keeps a hosted-reader fallback open if local yield proves too low.

### Integrations
| System | Purpose | Interface |
|--------|---------|-----------|
| Gmail API | Fetch unread newsletters | OAuth refresh token (Secret Manager), `google-api-python-client` |
| Local extractor (F-015) | Scrape source URLs to clean Markdown | `httpx` GET (browser-like UA, redirects) → `trafilatura` extraction, in-process |
| Anthropic Claude | Article + image prompt + LinkedIn post generation | `claude -p` CLI subprocess |
| Vertex AI (Imagen) | Image generation | `google-genai` SDK in `vertexai=True` mode |
| GitHub | Commit article + image to `allienna.github.io` | GitHub Contents API, fine-grained PAT |
| Firestore | Run state, articles, LinkedIn drafts, push subscriptions | Firebase SDK (PWA), `google-cloud-firestore` (Minion) |
| Web Push | iOS notifications | `pywebpush` (Minion), `PushManager` (PWA) |
| Cloud Billing | Budget kill-switch | Pub/Sub topic → Cloud Function disables Scheduler |

## 6. Error Handling

### User-Facing Errors
The PWA surfaces failures via three channels: a banner on the home view ("Run failed at step `<X>`"), the run history list (status pills `success` / `success_with_warnings` / `failure` / `skipped` / `aborted`), and iOS push notifications (silent for `skipped: no_sources`).

### Internal Error Patterns
Every step writes `status`, `started_at`, `ended_at`, `error?` to `runs/{runId}/steps/{stepName}`. Cloud Logging captures stack traces; structured logs include `runId` for correlation.

### Failure-Mode Policies
| Failure | Policy |
|---|---|
| Gmail auth expired | Hard fail. PWA banner with re-auth runbook link. Push notif sent. |
| Mailbox empty (no newsletter in 24h) | `skipped: no_sources`. No article. **No push notif** (avoids weekend noise). Visible in history. |
| Scrape failures / sources down | Continue if **≥50% sources scraped AND ≥5 sources OK**. Otherwise hard fail. (Local extraction has no central rate limit; this gate now guards mass fetch failure — bot-blocking, JS-only pages, timeouts.) |
| Claude error (timeout / 5xx / rate limit) | 2 retries with exponential backoff. Then hard fail. |
| Claude output validation fails | Agentic retry (max 2): re-invoke `claude -p /generate` with validation error fed back as input. Then hard fail. |
| Imagen quota / moderation rejection | Agentic retry (1): Claude rewrites prompt softer. Then publish article with **placeholder Le Veilleur generic image**. Run = `success_with_warnings`. |
| Theme detection returns unknown | Default `theme: "other"`. Continue. Not an error. |
| GitHub push fails | 3 retries with backoff. Then hard fail; article + image preserved in Firestore for manual replay. |
| Firestore write fails | Critical: 3 retries, then hard fail (no PWA visibility otherwise). |
| Web Push fails | Soft fail — log warning, run still `success`. |
| Concurrent run | New invocation aborts immediately: `aborted: already_running` (Firestore lock). |
| Single-run total timeout (>20 min) | Job killed by Cloud Run. State `timeout` written by sentinel before kill. |
| Budget cap hit (30€/mo) | Cloud Function disables Cloud Scheduler. Email + push notif. PWA banner. **Manual re-enable required.** |

**Explicitly non-handled for MVP:** cross-day duplicate-content detection (LinkedIn-share gate is the human safety); article quality scoring (no reliable automatic metric).

### Graceful Degradation
- GitHub Pages slow to deploy ≠ run failure: PWA reads from Firestore directly.
- Imagen failure ≠ article failure: placeholder image preserves daily cadence.
- Push failure ≠ run failure: opening the PWA always shows latest state.

## 7. Security & Compliance

### Authentication & Authorization
Defense-in-depth, three layers:
1. **Firestore Security Rules** — `allow read, write: if request.auth != null && request.auth.token.email == "<allowed>" && request.auth.token.email_verified == true;`
2. **trigger-api JWT verification** — validates Firebase Auth bearer token, checks `email` and `email_verified` claims.
3. **PWA client soft check** — UX only; non-allowed users redirected to "non autorisé" page.

The allowed email is **hardcoded** in three locations (`firestore.rules`, `trigger-api/src/auth.ts`, `pwa/src/config.ts`); the synchronisation invariant is documented in `CLAUDE.md`.

### Data Privacy
- Firestore data is owned by and about the operator only — no third-party PII.
- Newsletter content is third-party copyrighted material, handled via FR-A3 transformative-use constraints.
- Sender denylist (`minion/src/minion/config.py:EXCLUDED_SENDERS`) — empty for MVP, maintained manually.
- No analytics, no tracking, no third-party cookies.

### Compliance
None triggered: mono-tenant, mono-user, no payment data, no health data, no service-to-third-parties.

## 8. Configuration

### Secrets (all in GCP Secret Manager, accessed via Cloud Run Job SA with `secretmanager.secretAccessor`)
| Secret | Notes |
|---|---|
| `gmail-oauth-refresh-token` | Provisioned once via local OAuth flow on author's account. |
| `anthropic-oauth-token` | `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`. Valid 1 year. |
| `anthropic-api-key-fallback` | Not mounted by default. Manual activation if Max 5× breaks. |
| `github-pat-allienna-pages` | Fine-grained, scoped to `allienna.github.io`, `contents:write` + `metadata:read`. |
| `vapid-private-key` | Used by Minion to sign Web Push payloads. |

### Non-secret config
- Vertex AI access: SA IAM binding `roles/aiplatform.user` (no key).
- Firestore access: SA IAM binding `roles/datastore.user` on same GCP project as Firebase.
- Cloud Scheduler SA: `roles/run.invoker` on the Cloud Run Job.
- Budget alert: 30€/mo on the GCP project, 80% warning + 100% kill-switch via Pub/Sub → Cloud Function.

### Repo layout
```
veilleur-app/                     # this repo (monorepo)
  pwa/                            # React+Vite → Firebase Hosting
  minion/                         # Cloud Run Job container
    src/minion/                   # Python orchestrator
    .claude/commands/generate.md  # versioned agentic spec
    Dockerfile                    # multi-stage Python+Node
  trigger-api/                    # Cloud Run service for manual trigger
  shared/                         # JSON Schema + generated TS/Python types
  infra/                          # Terraform (or gcloud scripts)
  specs/                          # claude-feature-flow specs
  .github/workflows/              # build-minion, deploy-pwa, validate-specs
  CLAUDE.md, PRD.md, ROADMAP.md, DESIGN.md, README.md

allienna.github.io/               # SEPARATE existing repo, structure untouched
  veilleur/                       # Astro site
    src/content/posts/YYYY-MM-DD-<slug>.md   ← Minion writes here
    public/images/posts/YYYY-MM-DD.webp      ← Minion writes here
```

## 9. Implementation Sequence

### Phase 1 — Foundation (M0–M2, 2026-05-08 → 2026-05-10)
1. PRD signed (M0 — today's commit).
2. `/constitution` + `DESIGN.md` v1 (timebox 4h).
3. **Spike "Hello Veilleur"** (M2): minimal container that does Gmail pull → Vertex AI Imagen → Firestore write → GitHub commit, end-to-end, both locally and in Cloud Run. **De-risks R1 + R9 in one shot.**

### Phase 2 — Core pipeline (M3–M4, 2026-05-11 → 2026-05-14)
4. `/roadmap` + `/specify` feature 001 (Minion pipeline complete).
5. End-to-end run from author's machine: article + image generated, GitHub push OK, Firestore state visible. No PWA yet.

### Phase 3 — PWA & production (M5–M7, 2026-05-17 → 2026-05-20)
6. PWA Reading + Auth on Firebase Hosting, real iPhone tested.
7. PWA Supervision + Manual trigger + Push notif working on iPhone.
8. Cloud Scheduler enabled — first cron run at 06:00 — **production live (M7)**.

### Phase 4 — Hardening & demo prep (M8–M11, 2026-05-27 → 2026-06-12)
9. M8: 7 consecutive successful days.
10. M9: Reserved live-demo feature track stub created in `specs/`.
11. M10 (J-2): backup demo video recorded; ≥18/21 runs OK on rolling window.
12. M11: DevLille talk.

## 10. Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| R0 | Calendar pressure — 12 days incl. potential 4-day Ascension break | MVP slips past 2026-05-20 → ≥3-week prod window shortens | **High** | Decide Ascension this week; if leaving, prod target 2026-05-27 (still ≥2 weeks). MVP split into 2 atomic features (pipeline / PWA) to ship one without the other. |
| R1 | Claude Code Max 5× via OAuth in headless container — undocumented | Pipeline can't run → MVP hard-fails | **High** | Anthropic API key fallback in Secret Manager (cost ≤30€/mo). Validated by M2 spike (2026-05-10). |
| R2 | Imagen 4 Fast moderation false positives on owl-mascot prompts | `success_with_warnings` runs accumulate | Med | Agentic-retry-with-softer-prompt → placeholder fallback. Curated prompt template in `/generate`. |
| R3 | Gmail OAuth refresh token revocation | Hard pipeline failure until re-auth | Low-Med | Re-auth runbook documented; PWA banner on auth-expired Firestore state. |
| R4 | GitHub push race conditions on `allienna.github.io` | Conflict, retry, possible content loss | Low | Shallow-clone + commit-with-rebase on conflict. Document "no manual push to `veilleur/` between 06:00–06:15". |
| R5 | DevLille live-demo failure on stage (network, region outage, OAuth glitch) | Talk credibility damage | Low | Pre-recorded backup video. Demo designed to degrade gracefully — artefacts (`specs/`, git history, Firestore console, already-done morning article) tell the story without any live action. iPhone in airplane mode for non-demo apps. |
| R6 | `claude-feature-flow` workflow gaps discovered mid-build | Project ships; talk thesis weakens | Low | Talk defends spec coding as method, not the tool. Gaps become future content, not thesis breakdown. |
| R7 | LLM cost drift if `/generate` triggers verbose Claude reasoning | Hits 30€/mo cap → kill-switch fires | Med | Token caps (500k in / 30k out). Prompt cache where possible. Budget alerts at 80%. |
| R8 | iOS Web Push reliability (VAPID + iOS 16.4+ + home-screen install) | Daily ritual broken | Med | Document home-screen install as onboarding step. Fallback: PWA polls Firestore on open. |
| R9 | First-time integration of Cloud Run Job + Firestore + Vertex AI + Gmail OAuth + Imagen + GitHub — complex IAM/auth chain | Hours-to-days blocked on obscure auth point | Med | M2 spike covers the full chain in a "Hello Veilleur" container by 2026-05-10. |
| R10 | DESIGN.md timebox slippage (perfectionism on design system) | Calendar slip | Low-Med | Hard 4h timebox for v1. Iteration accepted during `/specify` of UI features. No blocking on "the right blue". |
| R11 | iOS Safari PWA quirks (service worker, install UX, push) on top of R8 | Degraded UX even when push works | Med | Test on real iPhone as soon as Firebase Hosting is up. Never simulate iOS in Chrome DevTools. |

## 11. Out of Scope

**Permanently out of scope:**
- Multi-source ingestion (RSS, X/Twitter, podcasts, YouTube) — Gmail only.
- Comments / reactions / webmentions on the Astro site.
- LinkedIn engagement analytics (likes, reach, impressions).
- Article re-generation for past dates.
- Multi-user / multi-tenant / SaaS.
- In-PWA article editing (use git directly).
- Native iOS / Android apps.
- Draft / review workflow (Minion publishes or fails).
- Notion sync (v1 used Notion; v2 does not).
- Browser extension for ad-hoc URL ingestion.

**Out of MVP, candidates for post-talk roadmap:**
- Search / full-text over archive (Vertex AI Vector Search or Algolia).
- Theme filtering UI / `/tags/[theme]` pages.
- Cross-newsletter trends detection.
- Source cards / individual source pages.
- LLM cost dashboard inside the PWA.
- PWA offline mode for past articles.
- NotebookLM Minion (podcast / video).
- Source-cards Minion.
- GitHub App in place of fine-grained PAT.
