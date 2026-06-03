# Tasks: Push notifications (Web Push + VAPID)

**Plan**: specs/012-push-notifications/plan.md
**Status**: Implemented
**Total**: 16 tasks across 4 phases

## Phase 1: Shared contract + infra + secrets

- [x] **T-1.1**: Add the push-subscription JSON Schema
  - **Do**: Create `shared/schema/push-subscription.json` (`$id` `https://veilleur.app/schema/push-subscription.json`, title `PushSubscription`). Fields: `endpoint` (string, uri), `keys` (object: `p256dh` string, `auth` string), `operatorEmail` (string, email), `createdAt` (string, date-time). `additionalProperties: false`; required = endpoint, keys, operatorEmail, createdAt. Mirror the style of `shared/schema/run.json`.
  - **Test**: `pnpm gen` then `pnpm check:codegen` — committed TS + Pydantic output regenerates and does not drift.

- [x] **T-1.2**: Regenerate + commit codegen output
  - **Do**: Run `pnpm gen`; commit the generated `shared/generated/ts/*` + `shared/generated/python/*` for `PushSubscription`. Never hand-edit generated files.
  - **Test**: `pnpm check:codegen` exits 0.

- [x] **T-1.3**: Grant Minion SA access to `vapid-private-key`
  - **Do**: In `infra/iam.tf`, add `"vapid-private-key"` to `local.minion_runtime_secrets` (the file already notes "added in F-012"). No other binding changes.
  - **Test**: `cd infra && terraform fmt -check && terraform validate` (no apply).

- [x] **T-1.4**: Wire VAPID config constants
  - **Do**: In `minion/src/minion/config.py` add `VAPID_PRIVATE_KEY_SECRET = "vapid-private-key"` and a `PUSH_SUBSCRIPTIONS_COLLECTION = "pushSubscriptions"` constant. In `pwa/src/config.ts` export `VAPID_PUBLIC_KEY` from `import.meta.env.VITE_VAPID_PUBLIC_KEY`; add `VITE_VAPID_PUBLIC_KEY` to `pwa/src/env.d.ts` and `pwa/.env.example`.
  - **Test**: `uv run pyright` (minion) + `pnpm --filter @veilleur/pwa run typecheck`.

## Phase 2: PWA subscribe + service worker

- [x] **T-2.1**: Switch vite-plugin-pwa to `injectManifest` + author `src/sw.ts`
  - **Do**: In `pwa/vite.config.ts` set `strategies: "injectManifest"`, `srcDir: "src"`, `filename: "sw.ts"`, keep `registerType: "autoUpdate"`. Create `pwa/src/sw.ts`: `precacheAndRoute(self.__WB_MANIFEST)` (port the current `globPatterns` app-shell precache) + re-create the `allienna.github.io` hero-image `StaleWhileRevalidate` runtime route (same cacheName/expiration as today).
  - **Test**: `pnpm --filter @veilleur/pwa run build` succeeds and emits `sw.js`; manual: offline cold-open still serves the app shell (precache regression guard, F-009 AC-10).

- [x] **T-2.2**: Add `push` + `notificationclick` handlers to the service worker
  - **Do**: In `pwa/src/sw.ts` add `self.addEventListener("push", …)` → `self.registration.showNotification(title, { body, data })` and `self.addEventListener("notificationclick", …)` → focus an open client or `clients.openWindow()` deep-linking to the run (`/runs/<date>` or `/`).
  - **Test**: `pnpm --filter @veilleur/pwa test` — a Vitest unit dispatching a synthetic `push` event asserts `showNotification` is called; a `notificationclick` test asserts focus/openWindow.

- [x] **T-2.3**: PWA subscribe/unsubscribe data module
  - **Do**: Create `pwa/src/data/pushSubscriptions.ts`: `subscribe()` (request `Notification.permission`, `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64(VAPID_PUBLIC_KEY) })`, upsert doc at `pushSubscriptions/{sha256(endpoint)}` with `operatorEmail`+`createdAt`), `unsubscribe()` (unsubscribe + delete doc), `currentState()`. Use the existing `db` from `firebase.ts`.
  - **Test**: `pnpm --filter @veilleur/pwa test pushSubscriptions` — mocked `Notification`/`pushManager`/Firestore: subscribe upserts once; re-subscribe same endpoint upserts (no duplicate); unsubscribe deletes.

- [x] **T-2.4**: `NotificationOptIn` component
  - **Do**: Create `pwa/src/components/NotificationOptIn.tsx` per DESIGN §2 (base `Button` + `Toast`): states not-subscribed / subscribed / permission-denied (inline iOS home-screen-install guidance) / error. Toasts "Notifications activées" / "désactivées" (DESIGN §4). `aria-label`; no icon-only. Mount in `AppHeader` (or settings affordance).
  - **Test**: `pnpm --filter @veilleur/pwa test NotificationOptIn` — renders each state; permission-denied shows guidance text, creates no subscription.

- [x] **T-2.5**: Firestore Rules — ownership-scoped `pushSubscriptions`
  - **Do**: In `firestore.rules` add `match /pushSubscriptions/{id}` allowing read/write/delete only when `isAllowedOperator()` and the doc's `operatorEmail` equals the pinned allowed email (on write: `request.resource.data.operatorEmail`; on read/delete: `resource.data.operatorEmail`). Leave `articles`/`runs` rules and global deny-by-default byte-identical. Do not add a new allowed-email pin location.
  - **Test**: `pnpm --filter @veilleur/pwa run test:rules` — allow own write, deny other-email write, deny unauthenticated; existing article/run rules tests still pass. `pnpm check:email` still passes (still 3 pins).

## Phase 3: Minion sender + orchestrator wiring

- [x] **T-3.1**: Add `pywebpush` dependency
  - **Do**: Add `pywebpush` to `minion/pyproject.toml` deps; `uv sync` to update `minion/uv.lock`. Note the new dep (+ transitive `py-vapid`/`cryptography`) in the PR description per CLAUDE.md.
  - **Test**: `cd minion && uv sync && uv run python -c "import pywebpush"`.

- [x] **T-3.2**: `SubscriptionStore` port + Firestore read adapter
  - **Do**: Add a `SubscriptionStore` Protocol (`list_subscriptions() -> list[PushSubscription]`, `delete(subscription_id)`) to `minion/src/minion/store/ports.py`; implement a Firestore adapter in `minion/src/minion/store/firestore.py` reading `pushSubscriptions` (collection from config). Validate docs with the generated Pydantic `PushSubscription` at the boundary (constitution §4).
  - **Test**: `uv run pytest minion/tests -k subscription` — adapter returns validated models from a fake Firestore client; bad doc raises at the boundary.

- [x] **T-3.3**: `Notifier` port + `webpush` implementation
  - **Do**: Create `minion/src/minion/notify/__init__.py` + `notify/webpush.py`: a `Notifier` Protocol (`notify(run: Run) -> None`) and `WebPushNotifier` that — for `success`/`success_with_warnings`/`failure` — reads subscriptions, signs with `secrets.require(VAPID_PRIVATE_KEY_SECRET)`, sends via `pywebpush`; **silent when `run.status == skipped and run.error == "no_sources"`**; on `410`/`404` deletes that subscription via `SubscriptionStore`; on any other send error logs `warning` and returns (never raises). Payload: title/body keyed off status + `date`/`runId` for deep-link (final FR strings chosen here).
  - **Test**: `uv run pytest minion/tests/test_notify.py` — mocked `pywebpush.webpush`: success→sends; no_sources→zero sends (AC-6); failure→"failed" push (AC-7); 410/404→prunes sub (AC-8); generic error→warning, no raise.

- [x] **T-3.4**: Re-home the send into the orchestrator (drop the PublishStep deferral)
  - **Do**: Add `notifier: Notifier` param to `run_pipeline` in `minion/src/minion/orchestrator.py`; call `notifier.notify(final)` **after** `run_store.finalize_run(...)` (and `get_run`), inside the try, so every terminal path (success/warnings/failure/skipped) reaches it. In `minion/src/minion/steps/publish.py` remove the "web push deferred (F-012)" comment/log — `PublishStep` is success-path persistence only.
  - **Test**: `uv run pytest minion/tests` — orchestrator tests pass with an injected fake notifier; assert `notify` called once with the final run on success, failure, and skipped paths.

- [x] **T-3.5**: Wire the Notifier in the CLI DI
  - **Do**: In `minion/src/minion/cli.py` construct the `FirestoreSubscriptionStore` + `WebPushNotifier` and pass `notifier=` into `run_pipeline` (alongside the existing store wiring). Keep construction lazy like `build_stores`.
  - **Test**: `uv run pytest minion/tests` + `uv run pyright`; `uv run python -m minion run --date 2099-01-01` wiring smoke (no live send — empty subscriptions → no-op).

## Phase 4: Verification + docs

- [x] **T-4.1**: VAPID keypair generation runbook + iOS prerequisite docs
  - **Do**: Document one-time VAPID keypair generation (`py-vapid`/`web-push`), where each key goes (private → Secret Manager `vapid-private-key`; public → `VITE_VAPID_PUBLIC_KEY`), and the iOS 16.4+ home-screen-install prerequisite (R8) in `pwa/README.md` + a `minion` doc note. Neither key committed.
  - **Test**: manual doc review; `pnpm check:email` + grep confirm no key literals in source.

- [x] **T-4.2**: Full gate + AC-10 deferral note
  - **Do**: Run the full verification matrix and fix any drift. Add a note to the spec/PR that AC-10 (real-iPhone delivery) is deferred to F-013 device pass (OQ-4), never simulated in Chrome DevTools (R11).
  - **Test**: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm check:codegen`, `pnpm check:email`, `pnpm --filter @veilleur/pwa run test:rules`; `cd minion && uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest` — all green.
