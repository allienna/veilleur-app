# Veilleur-app — Feature Roadmap

**Generated from**: PRD.md, specs/constitution.md, DESIGN.md
**Last updated**: 2026-08-04
**Status**: Approved

Decomposes the PRD into vertically-sliced features ordered by dependency. Each feature is self-contained, demoable, and sized for 0.5–2 days of work with Claude Code. Calendar context (historical): production target **2026-05-20** (M7), DevLille talk **2026-06-11** (M11) — both passed; see §Milestones "M∞ — Ongoing operation" for the current, deadline-free phase.

## Features

### F-001: Hello-Veilleur spike (de-risk)
**Summary**: One-shot container that completes the full IAM chain (Gmail pull → Vertex Imagen call → Firestore write → GitHub commit) end-to-end, both locally and on Cloud Run. No article generation yet — proves auth + plumbing work before investing in business logic.
**PRD sections**: §9 Phase 1 M2, §10 R1 + R9 mitigation
**Depends on**: None
**Delivers**: Dockerfile baseline, GCP project + Secret Manager seeded, working Cloud Run Job invocation, confidence that `CLAUDE_CODE_OAUTH_TOKEN` works in headless container.
**Surfaces**: `minion`
**Estimated size**: M
**Status**: Complete (R1 + R9 closed; reviewed Ready to merge)

### F-002: Monorepo scaffold + shared types + CLAUDE.md
**Summary**: Skeleton directories (`pwa/`, `minion/`, `trigger-api/`, `shared/`, `infra/`), JSON Schema source of truth with codegen to TS + Python, root `CLAUDE.md` with workspace build/lint/test commands, allowed-email constant pinned in three locations with CI grep test.
**PRD sections**: §8 Repo layout, §4 Scalability caps, constitution §4–§5
**Depends on**: F-001
**Delivers**: Compilable empty workspaces; `pnpm`, `uv`, `ruff`, `pyright` configured; CI scaffolding (`build-minion`, `deploy-pwa`, `validate-specs` workflows as stubs); allowed-email invariant enforced in CI.
**Surfaces**: repo-wide
**Estimated size**: M
**Status**: Complete (merged)

### F-003: Minion orchestrator core (state machine + Firestore)
**Summary**: Python 3.12 orchestrator with the 9-step state machine, per-step Firestore writes (`status`, `started_at`, `ended_at`, `error?`), Firestore concurrency lock, idempotent runs by date, Pydantic models for every I/O boundary, structured logging with `runId`. Real steps are stubs returning canned data.
**PRD sections**: FR-A1, FR-A2 (skeleton), constitution §2 principles 6–9
**Depends on**: F-002
**Delivers**: `python -m minion run --date YYYY-MM-DD` works locally; replay overwrites cleanly; concurrent invocation aborts with `aborted: already_running`; structured logs in stdout.
**Surfaces**: `minion`
**Estimated size**: L
**Status**: Complete (reviewed Ready to merge)

### F-004: Minion ingestion (Gmail + Jina)
**Summary**: Real implementations of step 1 (Gmail OAuth fetch, 24h window, denylist) and step 2 (Jina Reader scraping up to 100 URLs, paywall detection, ≥50% + ≥5 sources threshold). Schema validation gates the boundary.
**PRD sections**: FR-A2 steps 1–3, §6 Jina rate-limit policy, §7 sender denylist
**Depends on**: F-003
**Delivers**: First half of the daily run reaches "context assembly" with real upstream data; unit tests with mocked APIs cover happy path + degraded thresholds.
**Surfaces**: `minion`
**Estimated size**: M
**Status**: Complete (merged) — *scraper superseded: the Jina Reader engine is replaced by local extraction in **F-015** after F-013 burn-in proved Jina's free tier rate-limits below the pipeline's needs. The ingestion state machine, Gmail step, and ≥50%/≥5 gate are unchanged.*

### F-005: Agentic step `/generate` (the talk artefact)
**Summary**: `claude -p /generate` integration over the versioned `.claude/commands/generate.md` slash command (installed via the `allienna/claude-feature-flow` plugin per constitution §3). Output validation enforces Astro frontmatter, LinkedIn ≤3000 chars, image prompt ≤1000 chars, theme allowlist. Deterministic copyright post-validator (≤30-word quotes, max 1/source, n-gram overlap). Agentic retry on validation failure (max 2).
**PRD sections**: FR-A2 agentic call, FR-A3 copyright safety
**Depends on**: F-004, claude-feature-flow plugin pinned
**Delivers**: End-to-end article + LinkedIn + image-prompt generation. **The runtime literally executes a versioned spec — this is the on-stage thesis incarnated.**
**Surfaces**: `minion`
**Estimated size**: L
**Status**: Complete (merged)

### F-006: Imagen 4 Fast + GitHub publish
**Summary**: Vertex AI Imagen (`imagen-4.0-fast-generate-001`) image generation with moderation-rejection fallback (agentic prompt rewrite → placeholder image, status `success_with_warnings`). GitHub Contents API commit to `allienna/allienna.github.io` under `veilleur/site/content/posts/` + `public/images/posts/`, idempotent by date, 3-retry backoff.
**PRD sections**: FR-A2 steps 7–8, FR-A4, §6 Imagen + GitHub policies
**Depends on**: F-005
**Delivers**: First fully-autonomous local run produces a real published article on the public Astro site.
**Surfaces**: `minion`, writes to external `astro-site`
**Estimated size**: M
**Status**: Complete (merged)

### F-007: Cloud Run deployment + Cloud Scheduler + kill-switch
**Summary**: Multi-stage Dockerfile (Python 3.12 + Node 20 + git + `@anthropic-ai/claude-code`). Terraform (or gcloud scripts) for: Cloud Run Job, Cloud Scheduler cron at 06:00 Europe/Paris, service accounts, IAM bindings, Firestore + Vertex enablement. Budget kill-switch: Cloud Billing → Pub/Sub → Cloud Function disabling Scheduler at 100% of 30€/mo cap.
**PRD sections**: FR-A1 daily trigger, §8 Configuration, §10 R7 budget mitigation, constitution §2 principle 10
**Depends on**: F-006
**Delivers**: First scheduler-fired production run. **This is M7 — production live.**
**Surfaces**: `minion` infra
**Estimated size**: M
**Status**: Complete (merged)

### F-008: trigger-api micro-service
**Summary**: Cloud Run service (~50 LOC) that verifies Firebase Auth JWT, asserts `email == <allowed> && email_verified`, invokes the Cloud Run Job with payload, returns `runId`. Single endpoint `POST /trigger`. Allowed-email constant pinned per F-002 invariant.
**PRD sections**: FR-E1 server-side, FR-F1 layer 2
**Depends on**: F-007
**Delivers**: Manual trigger callable with a valid JWT from any HTTPS client (curl + Postman first; PWA wires it in F-011).
**Surfaces**: `minion` (sibling service)
**Estimated size**: S
**Status**: Complete (merged)

### F-009: PWA scaffold + Auth + Reading
**Summary**: React 18 + TS + Vite + Tailwind + shadcn/ui + `vite-plugin-pwa` on Firebase Hosting. Firebase Auth (Google sign-in), Firestore Security Rules (`email == <allowed> && email_verified`), client soft-check + `UnauthorizedScreen`. AppShell + AppHeader + Today + History views. ArticleCard, SkeletonCard, TagPill, ArticleView, EmptyState. Reads from Firestore (not Astro). LCP ≤2s on iPhone 4G.
**PRD sections**: FR-B1, FR-F1, §5 PWA tech stack
**Depends on**: F-002, F-006 (needs an article to read)
**Delivers**: Operator can sign in on iPhone, install to home screen, read today + last 30 articles. **First PWA on real device.**
**Surfaces**: `pwa`
**Estimated size**: L
**Status**: Complete (reviewed Pass-with-notes; AC-9 device LCP deferred to F-013)

### F-010: PWA LinkedIn share (two-tap)
**Summary**: `ShareSheet` with "Copier le post" (clipboard write) + "Enregistrer l'image" (Web Share API or `<a download>` for iOS Photos save). Toast confirmations. Wired into the ArticleView footer.
**PRD sections**: FR-C1
**Depends on**: F-009
**Delivers**: ≤30s flow from PWA-open to LinkedIn-paste-ready on iOS.
**Surfaces**: `pwa`
**Estimated size**: S
**Status**: Complete (reviewed Pass-with-notes; AC-7 device ≤30s flow deferred to F-013)

### F-011: PWA supervision + manual trigger
**Summary**: Real-time Firestore listener on `runs/{currentRunId}` (≤2s latency). `RunTimeline` + `RunStepRow` + `StatusPill` (six status tokens from DESIGN §1). Run history list ≥7 entries with cost + duration. `RunNowButton` calls `trigger-api`, navigates to live view. `ErrorBanner` for failed runs.
**PRD sections**: FR-D1, FR-D2 (must-have), FR-E1 client
**Depends on**: F-009, F-008
**Delivers**: Operator can supervise a live run from iPhone and trigger one manually.
**Surfaces**: `pwa`
**Estimated size**: L
**Status**: Complete (merged)

### F-012: Push notifications (Web Push + VAPID)
**Summary**: VAPID keys in Secret Manager. Service worker push handler. Push subscription persisted in Firestore. Minion sends via `pywebpush` on run completion (silent on `skipped: no_sources`). README documents iOS 16.4+ home-screen install as onboarding prerequisite.
**PRD sections**: FR-E2, §10 R8 + R11 mitigation
**Depends on**: F-011, F-007
**Delivers**: iPhone push notification fires on run completion. **Operator's daily ritual is fully closed-loop.**
**Surfaces**: `pwa` (subscriber) + `minion` (sender)
**Estimated size**: M
**Status**: Complete (reviewed Ready to merge; AC-10 device delivery deferred to F-013)

### F-013: Hardening + burn-in + demo prep
**Summary**: Re-auth runbook for Gmail/Anthropic OAuth (done). README polished as architectural exemplar (done). Backup demo video recorded for the talk (done, historical — M10). **Reframed post-talk**: the burn-in bar is no longer a pre-talk gate (the original ≥7-consecutive / ≥10-13 window tied to M8) but an **ongoing reliability objective** — see PRD §1 Ongoing goals, "≥60 consecutive autonomous days". Burn-in continues indefinitely in `specs/013-hardening-burn-in/burn-in-log.md` until that bar is met, with root-cause fixes landing in-track as discovered (mailbox/window bugs, copyright-validator false positives, F-015 scraper yield, weekend low-volume days).
**PRD sections**: §1 Ongoing goals (post-talk), §9 Phase 5 Ongoing operation, FR-G1 (historical), §10 R5 (historical, moot)
**Depends on**: F-012
**Delivers (historical, met)**: Talk-ready repository + safety net; backup video used in place of the live demo.
**Delivers (ongoing)**: Sustained daily reliability toward ≥60 consecutive successful runs; device ACs verified on real iPhone (T-3.3).
**Surfaces**: `minion`, `pwa`, repo
**Estimated size**: M (historical scope) — ongoing burn-in has no fixed size, it runs until the bar is met
**Status**: In Progress (ongoing — no longer gated by a talk date; T-4.2 demo-video task is historical/optional now that the talk has passed — a fallback was used live, whether the recorded video itself was ever finished is unverified in `tasks.md`, worth a quick check but no longer blocking)

### F-015: Ingestion resilience — local content extraction
**Summary**: Replace the Jina Reader scraper with in-container local extraction (`httpx` fetch + `trafilatura`), implementing the existing scraper port. No external rate limit / key / quota. Recalibrate paywall-detection markers for raw-HTML extraction; keep the `ok/paywalled/failed` outcome taxonomy and the ≥50%/≥5 validation gate (now guarding mass fetch failure rather than central throttling). Rename the `JinaClient` port → `ScraperClient` and `jina.py` → the new extractor module for coherence. Port stays open for a documented hosted-reader fallback if local yield proves too low.
**PRD sections**: §5 Tech Choices (2026-06-04 scraping amendment), §6 scrape-failure policy, FR-A2 step 2
**Depends on**: F-004 (supersedes its scraper), surfaced by F-013 burn-in
**Delivers**: Daily runs clear the ingestion gate without an external rate limit; burn-in (F-013) can resume. Unblocks the talk's "production runs daily" claim.
**Surfaces**: `minion`
**Estimated size**: M
**Status**: In Progress

### F-016: Supervision insights
**Summary**: Enriches the existing PWA supervision surface (F-011) with three read-only views built entirely from data already collected (`runs/{runId}/steps/{stepName}` since F-003, `burn-in-log.md` for the rolling window): (1) trends — 21-day rolling success rate, cumulative cost, failure-cause breakdown (`no_sources` / `insufficient_sources` / `missing_attribution` / other) over time; (2) richer failure diagnosis inline in a run's detail view (scrape ok/paywalled/failed breakdown, a link to the re-auth runbook on auth-related failures) instead of requiring a manual Firestore/log dig; (3) per-step drill-down on a past run (duration, tokens, error) beyond today's single overall status. No PRD change — fits within existing FR-D1 (live supervision) / FR-D2 (run history) scope, just deeper views of data already written.
**PRD sections**: FR-D1, FR-D2
**Depends on**: F-011 (extends it, does not replace it)
**Delivers**: Operator can spot reliability patterns (e.g. the weekend `insufficient_sources` correlation flagged in `burn-in-log.md`) and diagnose a failed run from the PWA alone, without SSH-ing into Firestore or Cloud Logging.
**Surfaces**: `pwa`
**Estimated size**: M
**Status**: Complete

## Feature Table

| # | Feature | Depends on | Size | Surface |
|---|---|---|---|---|
| F-001 | Hello-Veilleur spike | — | M | minion |
| F-002 | Monorepo scaffold + shared types + CLAUDE.md | F-001 | M | repo |
| F-003 | Minion orchestrator core | F-002 | L | minion |
| F-004 | Minion ingestion (Gmail + Jina) | F-003 | M | minion |
| F-005 | Agentic step `/generate` | F-004 | L | minion |
| F-006 | Imagen + GitHub publish | F-005 | M | minion (+ astro-site write) |
| F-007 | Cloud Run + Scheduler + kill-switch | F-006 | M | minion infra |
| F-008 | trigger-api micro-service | F-007 | S | minion |
| F-009 | PWA scaffold + Auth + Reading | F-002, F-006 | L | pwa |
| F-010 | PWA LinkedIn share | F-009 | S | pwa |
| F-011 | PWA supervision + manual trigger | F-009, F-008 | L | pwa |
| F-012 | Push notifications | F-011, F-007 | M | pwa + minion |
| F-013 | Hardening + burn-in (ongoing reliability) | F-012 | M (historical) / ongoing | repo-wide |
| ~~F-014~~ | ~~Live-demo reserved track stub~~ | ~~F-013~~ | — | **Retired** (talk passed, stub never activated) |
| F-015 | Ingestion resilience — local content extraction | F-004 (surfaced by F-013) | M | minion |
| F-016 | Supervision insights | F-011 | M | pwa |

## Dependency Graph

```
F-001 spike
  └─▶ F-002 scaffold
        ├─▶ F-003 orchestrator
        │     └─▶ F-004 ingestion
        │           └─▶ F-005 /generate  ← the talk artefact
        │                 └─▶ F-006 Imagen + GitHub
        │                       ├─▶ F-007 Cloud Run + Scheduler  ← M7 production live
        │                       │     ├─▶ F-008 trigger-api
        │                       │     └────────────────┐
        │                       └─▶ F-009 PWA scaffold + Auth + Reading
        │                             ├─▶ F-010 LinkedIn share
        │                             └─▶ F-011 supervision + trigger ◀─ F-008
        │                                   └─▶ F-012 push notifications ◀─ F-007
        │                                         └─▶ F-013 hardening + burn-in (ongoing)
        │                                               └─▶ F-016 supervision insights (extends F-011, not a burn-in gate)
        ├─▶ F-015 local extraction (supersedes F-004 scraper) ──┐
        │     (surfaced by F-013 burn-in; blocks burn-in resume)─┘──▶ F-013 burn-in continues
        └─ (F-009 also reads from F-006's article output)
```

Critical path (historical, pre-talk): **F-001 → F-002 → F-003 → F-004 → F-005 → F-006 → F-007 → F-008 → F-011 → F-012 → F-013** (11 steps; F-014 retired, no longer a terminal node). **F-015** is an out-of-band remediation (depends F-004, surfaced by F-013 burn-in): it is not on the original critical path but **gates F-013's burn-in progress** — burn-in cannot accumulate clean runs until F-015's yield issue is fully resolved (still ongoing post-talk, see burn-in-log.md weekend-correlation note). **F-016** depends only on F-011 (already merged) — it can be built any time, independent of F-013/F-015's burn-in progress; it's a PWA-only view enhancement, not gated by pipeline reliability. Post-talk, F-013 has no successor on the reliability chain — just a standing objective (§1 Ongoing goals, ≥60 consecutive days) that continues until met; F-016 is the first feature added purely for ongoing personal use rather than pre-talk hardening.

Parallelization opportunity: once F-006 lands, F-007 (deploy) and F-009 (PWA reading) can run in parallel — the Minion + PWA tracks split here.

## Milestones

### M3–M4 — Pipeline complete (PRD §9 Phase 2, deadline 2026-05-14)
**Features**: F-001, F-002, F-003, F-004, F-005, F-006
**After this**: One end-to-end run from author's machine produces a real article + image, commits to `allienna.github.io`, all state in Firestore. No PWA yet, no scheduler yet.
**Demoable**: `python -m minion run` → article visible on `allienna.github.io/veilleur` minutes later.

### M5–M7 — PWA + Production live (PRD §9 Phase 3, deadline 2026-05-20)
**Features**: F-007, F-008, F-009, F-010, F-011, F-012
**After this**: Cloud Scheduler fires daily; operator reads + shares on iPhone; live supervision + manual trigger + push notifications work end-to-end.
**Demoable**: First 06:00 cron-fired run lands; operator's iPhone notif arrives; full daily ritual works without touching a laptop.

### M8–M11 — Hardening + Demo (PRD §9 Phase 4, historical, completed 2026-06-11)
**Features**: F-013 (partial — burn-in bar not fully met pre-talk), ~~F-014~~ (retired)
**After this**: Backup demo video recorded; README + `specs/` + git history defensible as a spec-coding exemplar. The ≥7-consecutive / ≥10-13 burn-in bar was **not** met by the talk date (see burn-in-log.md).
**Demoable**: The DevLille talk itself, delivered 2026-06-11 — via the backup video / fallback path, not this app live. `specs/`, the slash-command spec at `minion/.claude/commands/generate.md`, and the git history told the story end-to-end regardless.

### M∞ — Ongoing operation (PRD §9 Phase 5, no fixed deadline)
**Features**: F-013 (continues), F-015 (yield issue still being root-caused), F-016 (new)
**Goal**: Reach ≥90% success on a rolling 21-day window, working toward ≥60 consecutive autonomous days (PRD §1 Ongoing goals). No calendar deadline — paced by the operator's actual daily use, not a milestone date.
**Current state (2026-08-04)**: 2/7 consecutive successes post-fix; three root causes (Gmail window anchoring, wrong mailbox, `missing_attribution` false positives) fixed 2026-07-31; a possible weekend low-volume effect on the remaining `insufficient_sources` failures is being tracked, not yet confirmed. F-016 (supervision insights) added to make that kind of pattern visible from the PWA itself instead of hand-built log analysis.

## Calendar reality — historical (superseded 2026-08-04)

> **Update 2026-08-04**: the talk (M11) happened on 2026-06-11 as scheduled; this app was not the live demo (backup video used instead). The section below is kept verbatim as historical record of the pre-talk planning. **From this point on, the roadmap has no calendar deadline** — see "M∞ — Ongoing operation" above, which is now the only live milestone. PRD §10 R0/R5/R10 (calendar/demo risks) are marked moot.

Today is **2026-05-19**. M7 production target is **2026-05-20** (T-1). The PRD §10 R0 risk explicitly flagged calendar pressure as **High** with the mitigation: "if leaving for Ascension, prod target slips to 2026-05-27 (still ≥2 weeks pre-talk)." Given F-001 has not yet started and the critical path through M7 spans 8 features, a 2026-05-20 production-live milestone is no longer reachable.

**Realistic re-baseline (preserves the 2 weeks of burn-in the PRD requires):**

| Phase | Original | Re-baselined | Notes |
|---|---|---|---|
| M3–M4 Pipeline complete | 2026-05-14 | **2026-05-25** | Six features at S/M/L cadence ≈ 6 days |
| M5–M7 Production live | 2026-05-20 | **2026-05-29** | Add 4 days for F-007→F-012 |
| M8 7-day burn-in achieved | 2026-05-27 | **2026-06-05** | 7 days after prod live |
| M10 J-2 backup video | 2026-06-09 | 2026-06-09 | Unchanged |
| M11 Talk | 2026-06-11 | 2026-06-11 | Unchanged |

Burn-in window shrinks from 21 to ~13 days. The PRD acceptance "≥18/21 OK on rolling window" (R5) becomes "≥10/13" — equivalent quality bar, less statistical confidence. Acceptable trade if F-005 (the on-stage thesis) and F-013 (defensible repo) both land cleanly.

**Update 2026-06-04 — burn-in window compressed again by F-015.** Burn-in started 2026-06-04 but the first runs hard-failed on the scraper (Jina rate-limiting), forcing the F-015 remediation *before* any clean run can land. Realistic earliest clean run ≈ 2026-06-05–06 (after F-015 ships + image redeploy). With the talk on 2026-06-11, that leaves **~5–6 days** of burn-in — the **≥7-consecutive bar is likely unreachable**. Decision needed (carry into F-013): (a) relax the consecutive bar (e.g. ≥5 consecutive + manual top-up runs to pad the window), (b) accept fewer consecutive successes and lean on the backup demo video (R5) + already-published articles for the talk, or (c) both. The ≥10/13 *window* bar may still be met via manual top-up runs once F-015 lands.

**Decision the roadmap is not the right place to make**: whether to (a) accept the slip, (b) cut scope — strongest candidate is F-010 (LinkedIn share can ship post-talk; manual copy/paste during demo is acceptable), or (c) ship Minion without PWA for the talk and treat the PWA as a v1.1.

## Status

Roadmap status: **Approved**. F-001 through F-012 are merged. F-013 (hardening + burn-in) is
**ongoing indefinitely** post-talk — no longer a pre-talk gate, now a standing reliability objective
(PRD §1, ≥60 consecutive autonomous days). F-014 (live-demo stub) is **retired** (2026-08-04): the
talk has passed, the stub directory was never created, and there is no more live-demo surface to
reserve it for. Per-feature statuses above are reconciled with shipped reality (F-013 AC-7) and with
the 2026-08-04 post-talk PRD/constitution revision.
