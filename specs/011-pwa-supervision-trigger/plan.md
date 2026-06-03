# Plan: PWA supervision + manual trigger

**Spec**: specs/011-pwa-supervision-trigger/spec.md

This track spans three workspaces: **`shared/`** (schema gains `costUsd`/`tokens`), **`minion/`** (capture + write cost; no other behaviour change), and **`pwa/`** (the supervision + trigger UI, the bulk of the work). The allowed-email invariant is untouched — `firestore.rules` reuses the existing `isAllowedOperator()`.

## Architecture Decisions

### AD-1: Data layer reconstructs `Run` from doc + `steps` subcollection (two listeners)
- **Choice**: The PWA subscribes with **two** `onSnapshot` listeners — one on the `runs/{date}` document, one on the `runs/{date}/steps` query — and merges them into a single `Run` view object, filling the canonical 9-step order from `StepName`, with absent steps rendered as *pending*. Mirrors the Minion's `FirestoreRunStore.get_run` reassembly (`minion/src/minion/store/firestore.py`).
- **Rationale**: Steps are **not** embedded in the run doc — the Minion writes them to a `steps/{stepName}` subcollection (`config.STEPS_SUBCOLLECTION`). The `steps[]` array in `shared/schema/run.json` is the assembled logical shape, not the wire format. A single doc listener would never see step updates.
- **Alternatives considered**: (a) one listener on the doc only — *wrong*, misses all step state. (b) Polling `getDoc` + `getDocs` on a timer — violates the ≤2s real-time AC and burns reads. (c) Ask the Minion to mirror steps into the doc as an array — larger Minion change, denormalizes the source of truth, rejected.

### AD-2: A `useRun(date)` hook owns the listener lifecycle; a `useTodayRun` derives the trigger-disable state
- **Choice**: `useRun(date)` encapsulates both `onSnapshot` subscriptions, returns `{ run, loading, error }`, and cleans up on unmount/date-change. The Today view uses `useRun(parisToday)` to know whether `status === "running"` (disables `RunNowButton`).
- **Rationale**: Keeps React effect/cleanup churn in one tested place; matches the existing `useAsync`/`useOnline` hook idiom in `pwa/src/lib/`. The data-access functions stay pure (`pwa/src/data/runs.ts`, mirroring `data/articles.ts`) and the hook wraps them for components.
- **Alternatives considered**: Listener logic inline in each route component — duplicated cleanup, hard to test, rejected.

### AD-3: Live elapsed duration via a 1s tick scoped to the running step
- **Choice**: A small `useNow(active)` interval (1s) runs only while a step is `running`; `RunStepRow` computes elapsed from `startedAt` against that clock. Completed steps compute a fixed `endedAt − startedAt`.
- **Rationale**: Firestore only re-renders on writes; without a local tick the running step's duration would freeze between step transitions. It drives text, not motion — unaffected by `prefers-reduced-motion` (Q4).
- **Alternatives considered**: Re-render only on snapshots (stale duration); a global app-wide ticker (wasteful re-renders on Today reading view), both rejected.

### AD-4: Trigger call uses the Firebase ID token; base URL from `VITE_TRIGGER_API_URL`
- **Choice**: `triggerRun(date?)` in `pwa/src/data/trigger.ts` calls `getIdToken(auth.currentUser)` and `POST`s `{ date? }` to `${TRIGGER_API_URL}/trigger` with `Authorization: Bearer <jwt>`. On `202 { date, execution }` it returns `date`; the caller navigates to `/runs/:date`. `TRIGGER_API_URL` is added to `pwa/src/config.ts` (from `import.meta.env.VITE_TRIGGER_API_URL`) and `pwa/.env.example`.
- **Rationale**: Matches the F-008 handler contract exactly (Bearer JWT, optional `{date}`, `202 {date, execution}`). Keying navigation on the returned `date` (not `execution`) aligns with the date-keyed run model (spec Q2).
- **Alternatives considered**: Hardcoding the URL (breaks per-env builds); navigating on `execution` (not a doc key) — rejected.

### AD-5: `costUsd` + `tokens` added to `run.json`; Minion captures via `claude --output-format json`
- **Choice**: Add nullable `costUsd: number|null` and `tokens: integer|null` to `shared/schema/run.json` (run-level), regenerate TS + Pydantic (`pnpm gen`). The `generate` runner switches to `claude --output-format json`, parses `total_cost_usd` + `usage` (input+output tokens), and returns them alongside the artefact text (now read from the JSON `result` field). The orchestrator threads them into `finalize_run`, which writes them to `runs/{date}`. A run that never reaches `generate` (e.g. `skipped: no_sources`, early failure) leaves them `null`.
- **Rationale**: Satisfies FR-D1/FR-D2 cost with the schema as the single source of truth (Q1 resolution). USD is the CLI's native unit — no FX assumption baked in. Nullable keeps replay/skip paths honest.
- **Alternatives considered**: (a) write `null` always now, populate later — fails the cost AC, rejected. (b) Char-heuristic token estimate (the existing `MAX_GENERATE_*_TOKENS` guard) — not real cost, misleading, rejected. (c) Store EUR via a hardcoded FX rate — stale/incorrect, rejected.
- **Risk/blast radius**: This is the one change reaching into F-005. The generate runner's output contract changes (text now nested in JSON `result`); `validate.py` and `test_generate_runner.py` must follow. **Fallback if the CLI JSON shape is unavailable in the pinned image**: keep the runner text-only and write `null` cost this track, reopening cost as a follow-up — captured here so `/implement` can degrade gracefully rather than block.

### AD-6: `firestore.rules` adds a `runs/{date}` read-allow / write-deny, reusing `isAllowedOperator()`
- **Choice**: Add a `match /runs/{date}` block (and `runs/{date}/steps/{step}` for the subcollection) allowing `read: if isAllowedOperator()` and `write: if false`, mirroring `articles/{date}`. Replace the stale "`runs/*` reads land in F-011" comment.
- **Rationale**: The subcollection needs its own match for the steps listener to read. No new email pin location — the invariant (constitution §2.1) and `check:email` are unaffected.
- **Alternatives considered**: A recursive `runs/{document=**}` allow — over-broad (would also expose any future sibling subcollections); explicit two-level match is tighter.

## Affected Files

### New Files
| File | Purpose |
|---|---|
| `pwa/src/data/runs.ts` | Pure Firestore access: `subscribeRun(date, cb)` (doc + steps listeners), `listRecentRuns(max)`, `assembleRun(doc, steps)`. Mirrors `data/articles.ts`. |
| `pwa/src/data/trigger.ts` | `triggerRun(date?)`: Firebase ID token → `POST /trigger` → returns `{ date }`. |
| `pwa/src/lib/useRun.ts` | Hook wrapping `subscribeRun` lifecycle → `{ run, loading, error }`. |
| `pwa/src/lib/useNow.ts` | 1s tick (active-gated) for live elapsed duration. |
| `pwa/src/components/StatusPill.tsx` | DESIGN `StatusPill` — colour token + status verb (dual-encoded). |
| `pwa/src/components/RunTimeline.tsx` | DESIGN `RunTimeline` — ordered 9-step list, `Card`-based. |
| `pwa/src/components/RunStepRow.tsx` | DESIGN `RunStepRow` — step name + status dot + duration. |
| `pwa/src/components/RunNowButton.tsx` | DESIGN `RunNowButton` — idle/loading/disabled/error states. |
| `pwa/src/routes/Supervision.tsx` | Run history view (replaces `SupervisionPlaceholder`). |
| `pwa/src/routes/Run.tsx` | Live/detail run view at `/runs/:date`. |
| `pwa/src/data/runs.test.ts` | `assembleRun` ordering/pending merge; listener wiring with fakes. |
| `pwa/src/components/supervision.test.tsx` | StatusPill dual-encoding, RunTimeline order/pending, RunNowButton states. |
| `minion/tests/test_run_cost.py` | Cost/tokens captured + written; null on skip/no-generate path. |

### Modified Files
| File | Change |
|---|---|
| `shared/schema/run.json` | Add nullable `costUsd`, `tokens` (run-level). |
| `shared/generated/ts/*`, `shared/generated/python/*` | Regenerated via `pnpm gen` (committed). |
| `firestore.rules` | Add `runs/{date}` + `runs/{date}/steps/{step}` read-allow / write-deny; drop stale comment. |
| `pwa/src/firestore.rules.test.ts` | Cover `runs` read-allow (operator) / read-deny (other) / write-deny. |
| `pwa/src/config.ts` | Add `TRIGGER_API_URL` from `VITE_TRIGGER_API_URL`. |
| `pwa/.env.example` | Document `VITE_TRIGGER_API_URL`. |
| `pwa/src/router.tsx` | `/supervision` → `Supervision`; add lazy `/runs/:date` → `Run`. |
| `pwa/src/routes/Today.tsx` | Mount `RunNowButton` (incl. the existing `EmptyState` no-article slot). |
| `minion/src/minion/generate/runner.py` | `--output-format json`; parse `total_cost_usd` + `usage`; return text + cost. |
| `minion/src/minion/generate/ports.py` / `models.py` | Carry `costUsd`/`tokens` on the generate result. |
| `minion/src/minion/orchestrator.py` | Thread cost into `finalize_run`. |
| `minion/src/minion/store/firestore.py` + `store/memory.py` | `finalize_run` writes/holds `costUsd`/`tokens`. |
| `minion/src/minion/store/ports.py` | `finalize_run` signature gains cost params. |
| `minion/tests/test_generate_runner.py` | Mock JSON output shape; assert cost parse. |
| `specs/roadmap.md` | F-011 status → Planning. |

## Implementation Phases

### Phase 1: Contract — schema + rules + config (foundation)
- Add `costUsd`/`tokens` to `shared/schema/run.json`; `pnpm gen`; `pnpm check:codegen` clean.
- `firestore.rules`: add `runs` read-allow/write-deny (doc + steps); extend `firestore.rules.test.ts`.
- `pwa/src/config.ts` + `.env.example`: `TRIGGER_API_URL`.
- Gate: `pnpm check:email` still green (no pin change), `pnpm typecheck`.

### Phase 2: Minion cost capture (the cross-surface change)
- `generate/runner.py` → `--output-format json`, parse `total_cost_usd` + `usage`; surface on the result model (`ports.py`/`models.py`).
- `orchestrator.py` → pass cost to `finalize_run`; `store/{ports,firestore,memory}.py` → persist `costUsd`/`tokens` (null when no generate).
- Tests: `test_generate_runner.py` (JSON parse), `test_run_cost.py` (write + null path).
- Gate: `uv run ruff check . && uv run pyright && uv run pytest`.

### Phase 3: PWA data layer + hooks
- `data/runs.ts` (`subscribeRun`, `listRecentRuns`, `assembleRun`), `data/trigger.ts`.
- `lib/useRun.ts`, `lib/useNow.ts`.
- Unit tests for `assembleRun` (9-step order, pending merge) and trigger token/POST with fakes.

### Phase 4: PWA components + routes (the visible surface)
- `StatusPill`, `RunStepRow`, `RunTimeline`, `RunNowButton`.
- `routes/Supervision.tsx` (history) replaces `SupervisionPlaceholder`; `routes/Run.tsx` (`/runs/:date`).
- `router.tsx` wiring; `RunNowButton` on Today + EmptyState.
- States: loading (skeleton), empty (no run for date), error (`ErrorBanner`), live (sky pulse), offline (`useOnline` → disabled button "Connexion requise").

### Phase 5: Integration + verification
- Component tests (dual-encoding, order/pending, button states); full gate: `pnpm lint && pnpm typecheck && pnpm build` + PWA tests; minion gate; `pnpm check:codegen` + `pnpm check:email`.
- Manual reduced-motion + dark-mode contrast sanity (AC-8); on-device latency deferred to F-013 (consistent with F-009/F-010).

## Design Mobilization
- **Tokens used**: `color.status.success`, `color.status.warning`, `color.status.error`, `color.status.neutral`, `color.status.muted`, `color.status.live` (+ pulse), `text.caption`, `radius.full` (status dot), `density.compact`, container `max-w-5xl` (supervision) / `max-w-3xl` (Today).
- **Components used**: `RunTimeline`, `RunStepRow`, `StatusPill`, `RunNowButton` (all in the DESIGN inventory — **no `/design update` needed**), plus existing `Card`, `Badge`, `Button`, `EmptyState`, `ErrorBanner`, `SkeletonCard`.
- **Surfaces touched**: `/` (Today — adds `RunNowButton`), `/supervision` (run history), `/runs/:date` (live run).
- **States covered**: loading, empty, error, success, **live (running pulse)**, offline.
- **A11y notes**: status dual-encoded (colour + FR verb) on every `StatusPill`; `running` pulse becomes a static dot under `prefers-reduced-motion`; WCAG AA contrast verified light + dark against `bg.default`.

## Test Strategy
- **Mocking approach**: PWA — Vitest + Testing Library; fake Firestore snapshots/`onSnapshot` and a stub `fetch`/`getIdToken` (mirrors `articles.test.ts`, `share.test.ts`). Firestore rules — the existing `@firebase/rules-unit-testing` harness in `firestore.rules.test.ts`. Minion — pytest with the `subprocess` mocked (as in `test_generate_runner.py`) and the in-memory store fakes for cost persistence.
- **Happy paths**: live run reflects step transitions; 9 steps render in order; history lists ≥7 newest-first; "Run now" → 202 → navigate to `/runs/:date`; cost parsed and written.
- **Error scenarios**: trigger 401/403/500 messaging + button reset; run-doc missing → EmptyState; step error → ErrorBanner; offline → button disabled; `skipped`/no-generate run → cost `null` → "—".
- **Edge cases**: step present in doc but `startedAt` null (pending render); running step elapsed ticks; date at Europe/Paris midnight boundary matches the handler's `parisDate`; replay overwrites (fresh `runId`, same date).

## Risk & Complexity
- **Estimated complexity**: **Medium–High** — UI breadth is moderate, but the cross-surface cost capture (AD-5) touches the F-005 generate runner's output contract.
- **Key risks**:
  1. **Generate runner JSON migration (AD-5)** — changing `--output-format` shifts the artefact from raw stdout to a JSON `result` field; `validate.py` + tests must follow. Fallback documented (write `null`, defer cost) so it can't block the PWA work.
  2. **Two-listener assembly (AD-1)** — race between doc and steps snapshots; assemble must tolerate either arriving first and partial step sets.
  3. **Firestore subcollection rule** — the steps listener needs its own `match`; missing it silently breaks live steps with a permission error.
- **New dependencies**: none — `firebase` (onSnapshot), `react-router-dom`, Vitest all already present. `VITE_TRIGGER_API_URL` is new config, not a package.
