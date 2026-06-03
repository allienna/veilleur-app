# Spec: PWA supervision + manual trigger

**Track ID**: 011-pwa-supervision-trigger
**Roadmap ref**: F-011
**Status**: In Progress
**Created**: 2026-06-03
**Branch**: feat/011-pwa-supervision-trigger
**PRD sections**: FR-D1 (live supervision), FR-D2 (run history), FR-E1 (manual trigger), FR-F1 (mono-tenant auth, client side)
**Depends on**:
- F-009 PWA scaffold + Auth + Reading — **Complete** (AppShell, AppHeader nav with `/supervision` target, `ErrorBanner`, Firestore client, auth)
- F-008 trigger-api micro-service — **merged** (`POST /trigger`, JWT-gated, returns `{ date, execution }`)

## Context

The Minion runs daily at 06:00 Europe/Paris and writes a `runs/{date}` document to Firestore with a per-step state machine (9 steps, F-003). Today the operator has no way to *see* a run happen or to *start* one on demand — the PWA's `/supervision` route is a placeholder (`SupervisionPlaceholder.tsx`), and `runs/*` reads are denied by Firestore rules (deny-by-default; the rule comment says "`runs/*` reads land in F-011").

This feature closes the supervision half of the operator's daily ritual: watch a run progress live from the iPhone, browse recent run history with cost/duration, and trigger a fresh run with one tap when needed (e.g. the cron was skipped, or a manual re-run is wanted). It is the last PWA prerequisite before F-012 push notifications make the loop fully closed.

## User Stories

- As the operator, I want to watch the current run's steps update in real time so that I know the pipeline is healthy without opening Cloud Logging.
- As the operator, I want to see the running step, elapsed time, and any error the moment it happens so that I can react to failures from my phone.
- As the operator, I want to browse the last several runs with their status, duration and LLM cost so that I can spot trends or a stuck day.
- As the operator, I want a "Run now" button that triggers the pipeline with my Firebase identity so that I can produce an article when the scheduler didn't (or I want a re-run).
- As the operator, I want the trigger button disabled while today's run is already in progress so that I don't double-fire the job.

## Functional Requirements

### FR-1: Live run supervision (`runs/{date}` listener) — FR-D1
Subscribe via Firestore real-time listeners (`onSnapshot`) to **both** the run document `runs/{date}` **and** its `runs/{date}/steps` subcollection — steps are stored as subcollection docs (`steps/{stepName}`), not as an embedded array; the `steps[]` in `shared/schema/run.json` is the *assembled* logical view that the data layer reconstructs (mirroring the Minion's `get_run`). The view renders the run-level status and the ordered 9-step timeline, updating within 2s of any Firestore write.

- The 9 canonical steps (`gmail`, `jina`, `validate_input`, `assemble`, `generate`, `validate_output`, `imagen`, `github`, `publish`, per `shared/schema/run.json` `StepName`) are **always rendered in order**, even before a step has started — steps absent from the doc's `steps[]` array render as *pending* (neutral dot, no duration).
- The currently-running step shows the `running` status with the sky pulse (`color.status.live`); the pulse is the loading affordance (DESIGN §interaction — "no spinner"). Pulse is disabled under `prefers-reduced-motion`.
- Each step row (`RunStepRow`) shows step name + status dot + duration (computed from `startedAt`/`endedAt`; live elapsed for the running step).
- Run-level error (`run.error`) and per-step error (`step.error`) surface via `ErrorBanner` (already built, F-009).
- Status is never communicated by colour alone — every `StatusPill` pairs the token colour with the FR status verb (`succès`, `avec avertissements`, `échec`, `ignoré`, `interrompu`, `en cours`) per DESIGN §accessibility.

### FR-2: Run document Firestore read rule — FR-F1
Extend `firestore.rules` to allow the allowed operator to **read** `runs/{date}` (and deny client writes — only the Minion's privileged service account writes runs, server-side). Mirrors the existing `articles/{date}` rule. The allowed-email invariant (constitution §2.1) is untouched — no new pin location; `isAllowedOperator()` is reused. `pwa/src/firestore.rules.test.ts` is extended to cover `runs` read-allow / write-deny.

### FR-3: Run history list — FR-D2
A list of the most recent runs (must-have: ≥7; target: up to 30), ordered newest-first, each showing status (`StatusPill`), date, duration and LLM cost. Tapping a run opens its live/detail supervision view. Rendered at `compact` density (DESIGN §layout — `/history`-class views).

> **Cost dependency (Q1 resolved):** `run.json` gains nullable `costUsd` + `tokens`; the Minion writes them (USD, from the claude CLI). History/live show "—" when null.

### FR-4: Manual trigger ("Run now") — FR-E1
A `RunNowButton` (DESIGN primary CTA) that `POST`s to the trigger-api `/trigger` endpoint with the operator's Firebase ID token as `Authorization: Bearer <jwt>`.

- Button states: `idle` → `loading` (request in flight) → on success navigate to the live supervision view for the returned `date`; on error show inline error (caption/`ErrorBanner`) and return to `idle`.
- Button is `disabled` while today's run is in progress (today's `runs/{paris-date}` doc has `status === "running"`), with the caption affordance per DESIGN.
- The trigger-api base URL is read from a build-time env var (`VITE_TRIGGER_API_URL`), added to `pwa/src/config.ts` and `pwa/.env.example`. Non-secret.
- The endpoint returns `202 { date, execution }`. The PWA keys the live view on **`date`** (the Firestore document key), not on `execution` — `execution` is the Cloud Run execution name and is not the run-doc key.

### FR-5: Routing + navigation
- The `/supervision` nav target (already in `AppHeader`) becomes the run **history** view (replaces `SupervisionPlaceholder`).
- A live/detail run view is added at `/runs/:date` (DESIGN §layout references `/runs/[id]`; the key is the date, the Firestore doc id). Lazy-loaded, consistent with the existing router pattern.
- `RunNowButton` appears on the Today view per DESIGN (and in the `EmptyState` "no article today" state, which already reserves a slot for it).

## API Endpoints Involved

| Source API | Method | Path | Purpose |
|------------|--------|------|---------|
| trigger-api (F-008) | POST | `/trigger` | Body optional `{ date? }`; `Authorization: Bearer <Firebase ID token>`. Returns `202 { date, execution }`. Errors: 401 unauthenticated, 403 forbidden, 400 bad_request, 500 invoke_failed. |
| Firestore (client SDK) | listen | `runs/{date}` | Real-time `onSnapshot` for the live run document. |
| Firestore (client SDK) | query | `runs` (orderBy date desc, limit N) | Run history list. |

## Design References

| Surface | Components used | New components needed |
|---------|-----------------|-----------------------|
| `/supervision` (run history) | `StatusPill`, `Card`, list rows (`compact` density), `EmptyState` | none — all inventoried |
| `/runs/:date` (live run) | `RunTimeline`, `RunStepRow`, `StatusPill`, `ErrorBanner` (existing), `Card` | none — all inventoried (DESIGN §components) |
| `/` Today | `RunNowButton` | none — inventoried |

All required components (`RunTimeline`, `RunStepRow`, `StatusPill`, `RunNowButton`) are present in the DESIGN.md inventory — **no `/design update` needed**. Status tokens cited by name: `color.status.{success,warning,error,neutral,muted,live}`; densities `compact`; container `max-w-5xl` for supervision.

## Error Scenarios

- **Firestore unreachable / offline**: read from SW cache where available; `RunNowButton` disabled with the caption-replacement "Connexion requise" (DESIGN §error states). `useOnline` already exists.
- **Run document missing** (`/runs/:date` for a date with no run): `EmptyState` ("Aucun run pour cette date") rather than an error.
- **Trigger 401/403**: surface "Session expirée / non autorisé" — prompt re-auth (soft). The real boundary is server-side; client message is UX only.
- **Trigger 500 invoke_failed**: inline error, button returns to `idle`, run not navigated to.
- **Trigger while already running**: button is pre-disabled (FR-4); if a race slips through, the Minion's Firestore concurrency lock aborts the duplicate with `aborted: already_running` (F-003) and the timeline shows the `aborted` status.
- **Step error mid-run**: `step.error` + run continues or fails per the state machine; `ErrorBanner` shows the failing step's message; subsequent steps render their actual status (likely `skipped`/pending).

## Acceptance Criteria

- [ ] AC-1: With a live `runs/{date}` doc being written, the supervision view reflects each step state change within 2s (FR-D1).
- [ ] AC-2: The current step name, live elapsed duration, and any error are visible in real time during a run.
- [ ] AC-3: All 9 steps render in canonical order; not-yet-started steps show as pending; the running step shows the sky pulse (static dot under `prefers-reduced-motion`).
- [ ] AC-4: The run history view shows ≥7 most recent runs newest-first, each with status, date, and duration (cost per Q1 resolution).
- [ ] AC-5: `firestore.rules` allows the allowed operator to read `runs/{date}` and denies all client writes; a non-allowed identity is rejected — covered by `firestore.rules.test.ts`.
- [ ] AC-6: "Run now" POSTs to `/trigger` with the Firebase ID token; on `202` the PWA navigates to `/runs/{returned date}`.
- [ ] AC-7: "Run now" is disabled while today's run has `status === "running"`.
- [ ] AC-8: Status is dual-encoded (colour + verb) on every `StatusPill`; WCAG AA contrast holds in light and dark.
- [ ] AC-9: `pnpm lint`, `pnpm typecheck`, `pnpm build`, and PWA unit tests pass; `pnpm check:email` still passes (no new pin divergence).

## Out of Scope

- Push notifications (F-012).
- Manual replay-from-failed-step UI (PRD FR-D2 nice-to-have; replay remains available via `gcloud run jobs execute`).
- Run history beyond 30 entries; LLM cost *dashboard* / charts (PRD nice-to-have).
- Any Minion-side change **other than** the minimal run-cost write, if Q1 is resolved in favour of including cost.
- On-device latency/perf measurement (deferred to the F-013 device pass, consistent with F-009/F-010).

## Open Questions (resolved 2026-06-03)

- **Q1 (cost/tokens — scope) → RESOLVED: (a) extend schema + Minion write.** Add nullable `costUsd` + `tokens` to `run.json` (codegen → TS + Pydantic). The Minion captures them by switching the `generate` runner to `claude --output-format json` (`total_cost_usd` + `usage`), threading the values through the step result → orchestrator → `runs/{date}` write. Native unit is USD (the CLI's unit; EUR conversion is out of scope). A run with no `generate` step (e.g. `skipped: no_sources`) writes `null`; the PWA renders "—". This pulls a contained F-005-runner change into the track — see Plan AD + Risk.
- **Q2 (live view route key) → RESOLVED: `/runs/:date`** (date = Firestore doc key + idempotency key; trigger-api returns `date`).
- **Q3 (history ordering) → RESOLVED: order by document id (`date`) desc** — no composite index; date is sortable as `YYYY-MM-DD`.
- **Q4 (elapsed ticking) → RESOLVED: 1s client interval** while a step is `running`; it drives a text duration, not motion, so unaffected by `prefers-reduced-motion`.
