# Plan: Push notifications (Web Push + VAPID)

**Spec**: specs/012-push-notifications/spec.md

## Architecture Decisions

### AD-1: Push sender lives in the orchestrator, after `finalize_run` — not in `PublishStep`
- **Choice**: Add a `Notifier` port, injected into `run_pipeline`, invoked once **after** `run_store.finalize_run(...)` with the final `(status, reason, date, runId)`. Remove the "web push deferred" responsibility from `PublishStep` (step 9).
- **Rationale**: A graceful terminal status (`skipped`/`no_sources` at step 3) **halts remaining steps** (`orchestrator.py:111` `break`), and a raising step records `failure` and halts too. So `PublishStep` (step 9) runs **only on the full-success path** — it can never fire the `failure` (FR-6) or `skipped` notifications. The orchestrator at finalize time is the single place that sees the terminal status + reason for *every* path. The no_sources reason is on the run doc as `status=="skipped"` + `error=="no_sources"` (from `StepResult(terminal_status=skipped, reason="no_sources")`, `ingestion.py:109`).
- **Alternatives considered**: (a) Keep send in `PublishStep` — rejected, can't reach failure/skipped paths. (b) A 10th pipeline step — rejected, a step that must run even after a prior step fails contradicts the "halt on terminal/failure" invariant; finalize-time hook is cleaner and keeps the 9-step contract intact.

### AD-2: Send-decision keys off `(status, reason)`, push failure is always soft
- **Choice**: Notifier sends for `success`, `success_with_warnings`, `failure`. Sends **nothing** when `status == skipped and reason == "no_sources"`. (Other `skipped`/`aborted` reasons: no push — only no_sources is a real terminal today; `aborted` already-running never reaches finalize with a notifier call worth firing. Pin exact set in tasks.) Every `pywebpush` error is caught: `410 Gone`/`404` → prune that subscription doc; any other error → `log.warning`, run status untouched.
- **Rationale**: FR-E2 + PRD §267 (no_sources silent), §275/§285 (push failure ≠ run failure, R8). The Notifier never raises into `run_pipeline`.
- **Alternatives considered**: Keying off status alone — rejected, can't distinguish no_sources from a future skip reason.

### AD-3: PWA service worker → `injectManifest` strategy with custom `src/sw.ts` (OQ-1)
- **Choice**: Switch `vite-plugin-pwa` from `generateSW` (default) to `injectManifest`. Author `pwa/src/sw.ts`: `precacheAndRoute(self.__WB_MANIFEST)` (app-shell), re-create the `allienna.github.io` hero-image `StaleWhileRevalidate` runtime route, and add `push` + `notificationclick` handlers. Keep `registerType: "autoUpdate"`.
- **Rationale**: A custom `push` handler is custom SW code; `generateSW` can't host it cleanly. `injectManifest` is the standard vite-plugin-pwa path for custom service workers and keeps full control of the handlers.
- **Cost/risk**: the existing app-shell precache (`globPatterns`) + hero-image runtime caching (currently auto-managed in `vite.config.ts`) must be faithfully re-implemented in `src/sw.ts` or offline reads (F-009 AC-10) regress. Covered by test strategy.
- **Alternatives considered**: `importScripts` into the generated SW — rejected (OQ-1), more constrained and brittle than owning the SW.

### AD-4: Subscription storage — `pushSubscriptions/{hash(endpoint)}` with `operatorEmail` ownership field (OQ-3)
- **Choice**: New Firestore collection `pushSubscriptions/{subscriptionId}` where `subscriptionId = sha256(endpoint)` (stable → re-subscribe upserts, never duplicates). Doc fields: `endpoint`, `keys.p256dh`, `keys.auth`, `operatorEmail`, `createdAt`. JSON Schema in `shared/schema/push-subscription.json` → codegen to TS + Pydantic (source-of-truth convention).
- **Rationale**: Endpoint-hash key gives idempotent upsert. `operatorEmail` lets the Firestore rule assert ownership on `create`/`update`.
- **Alternatives considered**: Auto-id docs — rejected, re-subscribe would orphan stale docs.

### AD-5: Firestore Rules — first client-writable collection, ownership-scoped
- **Choice**: Add a `match /pushSubscriptions/{id}` block: `allow read, write: if isAllowedOperator() && request.resource.data.operatorEmail == "<allowed>"` (on write) and `resource.data.operatorEmail == "<allowed>"` (on delete/read). Existing `articles`/`runs` read-only rules and the global deny-by-default stay byte-identical. Minion reads subscriptions server-side via its SA (bypasses rules).
- **Rationale**: This is the first collection the client writes; everything before was Minion-SA-only. Ownership guard keeps the mono-tenant boundary (constitution §2.1). `firestore.rules.test.ts` extended to cover allow-own / deny-other / deny-unauthenticated.
- **Note**: the allowed-email literal in `firestore.rules` stays the single pinned value — no new pin location (still 3 per CLAUDE.md invariant).

### AD-6: VAPID keys — private in Secret Manager (Minion SA), public as PWA build env (FR-1)
- **Choice**: Grant Minion runtime SA `secretAccessor` on `vapid-private-key` by adding it to `local.minion_runtime_secrets` in `infra/iam.tf`. Read it via the existing `minion.secrets.require(...)` helper + a `config.VAPID_PRIVATE_KEY_SECRET` constant. Public key shipped to PWA as `VITE_VAPID_PUBLIC_KEY` (non-secret, mirrors existing `VITE_`-Firebase pattern). Document one-time keypair generation in `pwa/README` / `minion` docs.
- **Rationale**: Keypair is app identity: private signs, public identifies. Reuses the proven secret-access + env-var patterns. Neither key in source (constitution §6).
- **Alternatives considered**: VAPID public also in Secret Manager — rejected, it's non-secret; build-env is simpler and matches Firebase config handling.

## Affected Files

### New Files
| File | Purpose |
|---|---|
| `shared/schema/push-subscription.json` | JSON Schema source of truth for the subscription doc (AD-4) |
| `shared/generated/ts/*` + `shared/generated/python/*` | Codegen output (committed; via `pnpm gen`) |
| `minion/src/minion/notify/__init__.py` | Notify package |
| `minion/src/minion/notify/webpush.py` | `Notifier` impl: read subscriptions, send via `pywebpush`, prune dead, soft-fail (AD-1/AD-2) |
| `minion/src/minion/store/` (subscription read) | `SubscriptionStore` port + Firestore adapter to read `pushSubscriptions` server-side |
| `minion/tests/test_notify.py` | Sender unit tests (success/warnings/failure/no_sources/prune/soft-fail) |
| `pwa/src/sw.ts` | Custom service worker: precache + hero cache + `push`/`notificationclick` (AD-3) |
| `pwa/src/data/pushSubscriptions.ts` | PWA: subscribe/unsubscribe + Firestore upsert (FR-2/FR-3) |
| `pwa/src/components/NotificationOptIn.tsx` | Opt-in control (**new DESIGN component — see blocker**) |
| `pwa/src/data/pushSubscriptions.test.ts` | Subscribe-flow unit tests |

### Modified Files
| File | Change |
|---|---|
| `minion/src/minion/orchestrator.py` | Inject `notifier: Notifier` into `run_pipeline`; call after `finalize_run` (AD-1) |
| `minion/src/minion/steps/publish.py` | Drop the "web push deferred" comment/hook; `PublishStep` is success-path persistence only |
| `minion/src/minion/cli.py` | Construct + wire the `Notifier` + `SubscriptionStore` into `run_pipeline` |
| `minion/src/minion/config.py` | Add `VAPID_PRIVATE_KEY_SECRET` constant + `pushSubscriptions` collection name |
| `minion/pyproject.toml` + `uv.lock` | Add `pywebpush` (+ transitive `py-vapid`/`cryptography`) dependency |
| `infra/iam.tf` | Add `vapid-private-key` to `local.minion_runtime_secrets` |
| `firestore.rules` | Add ownership-scoped `pushSubscriptions` match (AD-5) |
| `pwa/src/firestore.rules.test.ts` | Cover allow-own / deny-other / deny-unauthenticated on `pushSubscriptions` |
| `pwa/vite.config.ts` | `strategies: "injectManifest"`, `srcDir`/`filename` → `src/sw.ts`; move precache + hero caching into the custom SW (AD-3) |
| `pwa/src/config.ts` | Export `VAPID_PUBLIC_KEY` from `VITE_VAPID_PUBLIC_KEY` |
| `pwa/.env.example` / `env.d.ts` | Document `VITE_VAPID_PUBLIC_KEY` |
| `pwa/src/components/AppHeader.tsx` (or settings surface) | Mount `NotificationOptIn` |
| `pwa/README.md` + `minion` docs | VAPID keypair generation runbook; iOS home-screen-install prerequisite (R8) |

## Implementation Phases

### Phase 1: Shared contract + infra + secrets
- `shared/schema/push-subscription.json` + `pnpm gen` (commit TS + Pydantic output).
- `infra/iam.tf`: grant `vapid-private-key` to Minion SA.
- `minion/config.py` constant; `pwa/config.ts` + env wiring for the public key.
- Foundation everything else depends on.

### Phase 2: PWA subscribe + service worker
- Switch `vite.config.ts` to `injectManifest`; author `src/sw.ts` (precache + hero cache + push/notificationclick handlers).
- `pushSubscriptions.ts` subscribe/unsubscribe + Firestore upsert (endpoint-hash id).
- `NotificationOptIn` component (permission request, state reflection, iOS install guidance), mounted in AppHeader/settings.
- `firestore.rules` ownership block + rules tests.

### Phase 3: Minion sender + orchestrator wiring
- `SubscriptionStore` read adapter; `notify/webpush.py` `Notifier` (send by status, prune 410/404, soft-fail).
- `run_pipeline`: inject + call notifier after `finalize_run`; clean up `publish.py` deferral.
- `cli.py` DI wiring; `pywebpush` dependency.
- Unit tests: success / success_with_warnings / failure / no_sources-silent / prune-dead / soft-fail.

### Phase 4: Verification + docs
- `pnpm check:codegen`, `pnpm lint`/`typecheck`, `uv run ruff/pyright/pytest`, rules tests.
- VAPID keypair generation runbook + iOS install prerequisite in READMEs.
- AC-10 (real-device delivery) explicitly logged as deferred to F-013.

## Design Mobilization

- **Tokens used**: `shadow.lg` (toast), `radius.md` (button), status color tokens for notification-state copy alignment; `motion` reduced-motion rules already global.
- **Components used**: `Button`, `Toast` (subscribe/permission feedback), `ErrorBanner`/`EmptyState` copy already cover the failure + no_sources surfaces.
- **🚧 New component required (BLOCKER)**: `NotificationOptIn` is **not** in the DESIGN closed inventory (§2). DESIGN §2 mandates `/design update` before a needed component can be implemented. **Run `/design update` to add `NotificationOptIn` (base: `Button`; states: not-subscribed / subscribed / permission-denied-with-iOS-guidance) before `/implement`.** It is a thin wrapper over `Button` + `Toast`, so the inventory delta is small.
- **Surfaces touched**: AppHeader (or a settings affordance) — the opt-in entry point.
- **States covered**: not-subscribed, subscribed, permission-denied (iOS install guidance), error (toast). The notification itself is OS-rendered (not a DESIGN component) — copy/tone only.
- **A11y notes**: opt-in control needs an `aria-label`; permission-denied guidance is text, not icon-only.

## Test Strategy
- **Mocking approach**: Minion — pytest with a mocked `pywebpush.webpush` and an in-memory `SubscriptionStore` (mirrors existing mocked-API step tests, e.g. `test_gmail_step.py`). PWA — Vitest + jsdom with mocked `Notification`, `registration.pushManager`, and Firestore writes (mirrors `runs.test.ts`/`trigger.test.ts`). Rules — Firestore emulator (`pnpm test:rules`).
- **Happy paths**: subscribe creates+persists a sub; `success` run sends one push per sub with status-appropriate payload; SW `push` event renders a notification; `notificationclick` focuses/opens.
- **Error scenarios**: `no_sources` → zero sends (AC-6); `failure` → "failed" push (AC-7); 410/404 → prune that sub, run status unchanged (AC-8); generic send error → warning logged, no run-status change.
- **Edge cases**: zero stored subscriptions → no-op; re-subscribe same endpoint → upsert not duplicate; rules deny non-owner / unauthenticated writes; offline reads still work after the SW strategy switch (precache regression guard).

## Risk & Complexity
- **Estimated complexity**: Medium-High (spans `pwa` + `minion` + `infra` + `shared` + `firestore.rules`; the SW strategy switch is the trickiest piece).
- **Key risks**:
  - **R-A (SW switch regresses offline reads)**: `injectManifest` means the precache + hero caching are now hand-written; a miss breaks F-009 AC-10. Mitigate: port the exact `globPatterns` + runtime route; test offline cold-open.
  - **R-B (iOS push reliability, PRD R8/R11)**: unprovable without a real iPhone → AC-10 deferred to F-013; automated tests + the F-011 Firestore-listener fallback are the safety net.
  - **R-C (first client-writable Firestore collection)**: a loose rule could widen the mono-tenant boundary. Mitigate: ownership-scoped rule + explicit deny tests; allowed-email pin unchanged.
  - **R-D (push failure leaking into run status)**: mitigate via AD-2 soft-fail; the notifier never raises into `run_pipeline`.
- **New dependencies**: `pywebpush` (Python, + `py-vapid`/`cryptography` transitively) — review in PR per CLAUDE.md lockfile convention. No new TS deps (`PushManager`/`Notification` are platform APIs; `vite-plugin-pwa` already present).
