# Tasks: PWA supervision + manual trigger

**Plan**: specs/011-pwa-supervision-trigger/plan.md
**Status**: Ready
**Total**: 18 tasks across 5 phases

Commands (CLAUDE.md): TS from repo root — `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test`; single PWA file — `pnpm --filter @veilleur/pwa exec vitest run <file>`; rules — `pnpm test:rules`; codegen — `pnpm gen` / `pnpm check:codegen`; email pin — `pnpm check:email`. Minion from `minion/` — `uv run ruff check . && uv run pyright && uv run pytest`.

## Phase 1: Contract — schema, rules, config

- [x] **T-1.1**: Add `costUsd` + `tokens` to the run schema and regenerate
  - **Do**: In `shared/schema/run.json`, add run-level `costUsd` (`type: ["number","null"]`) and `tokens` (`type: ["integer","null"]`) with descriptions (USD native unit; null when no `generate` step ran). Run `pnpm gen` to regenerate `shared/generated/{ts,python}` (committed).
  - **Test**: `pnpm check:codegen` (clean — no drift)

- [x] **T-1.2**: Allow operator reads on `runs/{date}` + steps subcollection in Firestore rules
  - **Do**: In `firestore.rules`, add `match /runs/{date}` and `match /runs/{date}/steps/{step}` with `allow read: if isAllowedOperator();` and `allow write: if false;` (mirror `articles/{date}`, reuse `isAllowedOperator()`). Replace the stale "`runs/*` reads land in F-011" comment. **No new email pin.** Extend `pwa/src/firestore.rules.test.ts`: operator can read run + step, non-operator denied, all client writes denied.
  - **Test**: `pnpm test:rules`

- [x] **T-1.3**: Add `TRIGGER_API_URL` config + env example
  - **Do**: In `pwa/src/config.ts` export `TRIGGER_API_URL` from `import.meta.env.VITE_TRIGGER_API_URL` (non-secret, with a comment). Add `VITE_TRIGGER_API_URL` to `pwa/.env.example`. Add the type to `pwa/src/env.d.ts` if `ImportMetaEnv` is declared there.
  - **Test**: `pnpm --filter @veilleur/pwa run typecheck`

## Phase 2: Minion cost capture (cross-surface change, AD-5)

- [x] **T-2.1**: Capture `total_cost_usd` + tokens from the generate CLI
  - **Do**: In `minion/src/minion/generate/runner.py`, add `--output-format json` to the invocation, parse the JSON, read the artefact text from the `result` field and `total_cost_usd` + `usage` (input+output) into a small result object. Update `generate/ports.py` / `generate/models.py` so the runner returns `(text, costUsd, tokens)`. Keep the `GenerateTransportError` paths. **Fallback (plan AD-5):** if the JSON shape is absent, leave cost/tokens `None` rather than failing.
  - **Test**: `cd minion && uv run pytest tests/test_generate_runner.py` (update mocks to the JSON shape; assert cost parsed)

- [x] **T-2.2**: Thread cost into the run document
  - **Do**: Extend `store/ports.py` `finalize_run` signature with `cost_usd`/`tokens`; persist them in `store/firestore.py` (`finalize_run` update) and `store/memory.py`. In `orchestrator.py`, capture cost from the generate step result and pass it to `finalize_run` (null when the run never reached `generate`, e.g. `skipped`/early failure).
  - **Test**: `cd minion && uv run pytest` (add `tests/test_run_cost.py`: cost written on success; `None` on skip/no-generate path)

- [x] **T-2.3**: Minion full gate
  - **Do**: No new code — confirm the cross-surface change is clean end to end.
  - **Test**: `cd minion && uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest`

## Phase 3: PWA data layer + hooks

- [x] **T-3.1**: `data/runs.ts` — assemble a Run from doc + steps (AD-1)
  - **Do**: Create `pwa/src/data/runs.ts` with `assembleRun(docData, stepDocs): Run` (fills the canonical 9-step order from the `StepName` enum; absent steps → pending), `subscribeRun(date, cb)` (two `onSnapshot` listeners — `runs/{date}` doc + `runs/{date}/steps` query — merged, tolerant of either arriving first), and `listRecentRuns(max=30)` (`orderBy(documentId(),'desc')`, limit). Mirror `data/articles.ts` (inject `Firestore` for tests).
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/data/runs.test.ts` (create it: order/pending merge, partial-snapshot tolerance, limit)

- [x] **T-3.2**: `data/trigger.ts` — call the trigger-api with the ID token (AD-4)
  - **Do**: Create `pwa/src/data/trigger.ts` with `triggerRun(date?): Promise<{date: string}>` — `getIdToken(auth.currentUser)`, `POST ${TRIGGER_API_URL}/trigger` with `Authorization: Bearer <jwt>` and optional `{date}` body; on `202` return `{date}` from the response; map 401/403/500 to typed errors. Inject `fetch`/token getter for tests.
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/data/trigger.test.ts` (create it: sends Bearer + body, returns date on 202, throws on 401/403/500)

- [x] **T-3.3**: `useRun` + `useNow` hooks (AD-2, AD-3)
  - **Do**: Create `pwa/src/lib/useRun.ts` (wraps `subscribeRun`, returns `{run, loading, error}`, cleans up on unmount/date change) and `pwa/src/lib/useNow.ts` (1s interval gated by an `active` flag for live elapsed). Follow the `useAsync`/`useOnline` idiom.
  - **Test**: `pnpm --filter @veilleur/pwa run typecheck` (behaviour covered by the Phase 4 component tests)

## Phase 4: PWA components + routes

- [x] **T-4.1**: `StatusPill` — dual-encoded status (AC-8)
  - **Do**: Create `pwa/src/components/StatusPill.tsx` over `Badge`, mapping each of the six `RunStatus` tokens to its `color.status.*` token **and** its French verb (`succès`, `avec avertissements`, `échec`, `ignoré`, `interrompu`, `en cours`). Never colour-only.
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/components/supervision.test.tsx` (create it: each status renders its verb)

- [x] **T-4.2**: `RunStepRow` — name + status dot + duration
  - **Do**: Create `pwa/src/components/RunStepRow.tsx`: step name, `radius.full` status dot, duration from `startedAt`/`endedAt`; running step uses `useNow` for live elapsed and the `color.status.live` sky pulse — static dot under `prefers-reduced-motion`. Pending step (no `startedAt`) shows neutral dot, no duration.
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/components/supervision.test.tsx` (pending vs running vs done render; reduced-motion → no pulse class)

- [x] **T-4.3**: `RunTimeline` — ordered 9-step list
  - **Do**: Create `pwa/src/components/RunTimeline.tsx` (`Card`-based) rendering all 9 steps in canonical order via `RunStepRow`, surfacing `run.error`/step error through the existing `ErrorBanner`.
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/components/supervision.test.tsx` (9 rows in order; ErrorBanner on error)

- [x] **T-4.4**: `RunNowButton` — idle/loading/disabled/error (AC-6, AC-7)
  - **Do**: Create `pwa/src/components/RunNowButton.tsx` over `Button`: calls `triggerRun`, transitions idle→loading→(navigate on success | inline error→idle); `disabled` when today's run `status === "running"` or offline (`useOnline` → caption "Connexion requise"). Accept an `onTriggered(date)` callback for navigation.
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/components/supervision.test.tsx` (loading state; disabled while running/offline; error resets to idle)

- [x] **T-4.5**: Supervision (history) route replaces the placeholder (FR-D2)
  - **Do**: Create `pwa/src/routes/Supervision.tsx` using `listRecentRuns` — `compact` density, `max-w-5xl`, newest-first, each row `StatusPill` + date + duration + cost (`—` when null), tap → `/runs/:date`. Loading → skeleton; empty → `EmptyState`. Delete `pwa/src/routes/SupervisionPlaceholder.tsx`.
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/routes` (or `pnpm --filter @veilleur/pwa run typecheck` if no route test)

- [x] **T-4.6**: Live run route `/runs/:date` (FR-D1)
  - **Do**: Create `pwa/src/routes/Run.tsx` using `useRun(date)` + `RunTimeline`; missing run → `EmptyState` ("Aucun run pour cette date"); run error → `ErrorBanner`. `max-w-5xl`, `compact`.
  - **Test**: `pnpm --filter @veilleur/pwa run typecheck`

- [x] **T-4.7**: Router + Today wiring
  - **Do**: In `pwa/src/router.tsx`, point `/supervision` at `Supervision` and add a lazy `/runs/:date` → `Run`. In `pwa/src/routes/Today.tsx`, mount `RunNowButton` (wire navigation to `/runs/:date`) including the existing `EmptyState` no-article slot.
  - **Test**: `pnpm --filter @veilleur/pwa run build`

## Phase 5: Integration + verification

- [x] **T-5.1**: A11y sanity — reduced-motion + dark contrast (AC-8)
  - **Do**: Confirm the `running` pulse becomes a static dot under `prefers-reduced-motion` (assert in `supervision.test.tsx`) and spot-check WCAG AA contrast for status tokens in light + dark against `bg.default`. On-device latency deferred to F-013.
  - **Test**: `pnpm --filter @veilleur/pwa exec vitest run src/components/supervision.test.tsx`

- [x] **T-5.2**: Full project gate
  - **Do**: No new code — green the whole pipeline across all touched surfaces.
  - **Test**: `pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm check:codegen && pnpm check:email && pnpm test:rules` (and `cd minion && uv run ruff check . && uv run pyright && uv run pytest`)
