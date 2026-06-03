# Spec: Push notifications (Web Push + VAPID)

**Track ID**: 012-push-notifications
**Roadmap ref**: F-012
**Status**: Complete (reviewed Ready to merge; AC-10 on-device delivery deferred to F-013)
**Created**: 2026-06-03
**Branch**: feat/012-push-notifications
**PRD sections**: FR-E2, §10 R8 + R11
**Depends on**:
- F-011 PWA supervision + manual trigger — **Complete** (shipped #15)
- F-007 Cloud Run + Scheduler + kill-switch — **Complete** (shipped #11)

## Context

The operator's daily ritual is "open phone → article ready". Today they must open the PWA to learn a run finished. FR-E2 closes the loop: an iOS push notification fires when a run completes, so the operator knows the article is ready (or that a run failed) **before** opening the app. This is the final must-have of the M5–M7 production-live milestone and the last feature before hardening (F-013).

Web Push on iOS requires the PWA be installed to the home screen (iOS 16.4+). The sender is the Minion (step 9, `publish`), which already has a documented hook awaiting this feature (`publish.py:195` "web push deferred (F-012)"). The subscriber is the PWA via the `PushManager` API and a service-worker push handler.

R8 (iOS Web Push reliability) and R11 (Safari PWA quirks) are flagged Medium in the PRD: push failure must never break a run, and the PWA-polls-on-open fallback (already true via the F-011 Firestore listener) is the safety net.

## User Stories

- As the operator, I want an iOS push notification when a run finishes so that I know the article is ready before opening the app.
- As the operator, I want to enable notifications from inside the PWA (grant permission, subscribe) so that setup is one tap, not a settings hunt.
- As the operator, I do **not** want a notification when the run is `skipped: no_sources` so that weekends/holidays with no newsletter stay silent.
- As the operator, I want a failed run's notification to tell me it failed so that I can act (re-auth, manual retry) without opening the app first.

## Functional Requirements

### FR-1: VAPID key provisioning (infra + secrets)
- `vapid-private-key` secret slot already exists in Secret Manager (created in the F-001 spike state). This feature grants the Minion runtime SA `secretAccessor` on it by adding it to `local.minion_runtime_secrets` in `infra/iam.tf` (the file already notes "vapid-private-key is added in F-012").
- The VAPID **public** key is non-secret and is shipped to the PWA as a build-time env var (`VITE_VAPID_PUBLIC_KEY`), consistent with the existing `VITE_`-prefixed Firebase config.
- VAPID keys are an application-identity keypair: generate once, store private in Secret Manager, public in PWA env. Document the generation command (`pywebpush`/`py-vapid` or `web-push`) in the README; never commit either key to source.

### FR-2: PWA subscribe flow (`PushManager`)
- A notification opt-in control in the PWA (placement per DESIGN — likely AppHeader or a settings affordance) that, on tap: requests `Notification.permission`, then `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <VAPID public> })`.
- The resulting `PushSubscription` (endpoint + p256dh + auth keys) is persisted to Firestore so the Minion can read it server-side at send time.
- The control reflects state: not-subscribed → "Activer les notifications"; subscribed → confirmation / "désactiver"; permission denied → guidance (iOS requires home-screen install first).
- Re-subscribing is idempotent (same endpoint upserts, not duplicates).

### FR-3: Push subscription storage + Firestore Rules
- New Firestore collection (proposed `pushSubscriptions/{subscriptionId}`) holding the subscription JSON. `subscriptionId` should be a stable hash of the endpoint so re-subscribe upserts.
- **This is the first client-write collection.** Current rules deny all client writes (only the Minion SA writes, server-side). Rules must allow the allowed operator to create/update/delete **their own** subscription docs, while the Minion SA reads them server-side (bypasses rules). The deny-by-default for all other collections stays.
- A `shared/schema/` JSON Schema for the subscription doc (source of truth → TS + Pydantic codegen), consistent with the §"single source of truth" convention.

### FR-4: Service-worker push handler
- The SW must handle `push` events (`self.addEventListener("push", …)` → `showNotification`) and `notificationclick` (focus/open the PWA, ideally deep-link to the run).
- **Architecture flag**: the PWA currently uses `vite-plugin-pwa` with `registerType: "autoUpdate"` and Workbox `generateSW` (auto-generated SW, no custom code). A push handler is custom SW code → this requires switching to the `injectManifest` strategy (custom `src/sw.ts` with `precacheAndRoute(self.__WB_MANIFEST)` + push handlers) **or** importing a custom script into the generated SW. `/plan` must pick the approach; it touches the existing offline-reads/app-shell precache config in `vite.config.ts`.

### FR-5: Minion sender (step 9 `publish`)
- After the article doc is upserted (`PublishStep.run`, currently the deferral point), send Web Push to every stored subscription via `pywebpush`, signing with the VAPID private key from Secret Manager.
- Payload conveys run outcome: title/body keyed off final run status (`success` / `success_with_warnings` / `failure`) + enough to deep-link (e.g. `date`/`runId`).
- **Silent on `skipped: no_sources`** (FR-E2 AC + PRD §error-table): no push sent. Note the run-status enum has no dedicated `no_sources` token — `skipped` is the status and the reason lives elsewhere (`error`/result detail); the send-decision must key off the *reason*, not just `skipped`. `/plan` to pin where the no_sources reason is read.
- **Push failure ≠ run failure** (PRD §285, R8): expired/invalid subscriptions (410 Gone / 404) are pruned; any send error is logged as a warning and the run status is unchanged. Pydantic at the boundary per constitution §4.

### FR-6: Failure-path notifications
- A `failure` run also sends a push ("Run failed at step X") so the operator can act. Aligns with the PRD error table rows (Gmail auth expired → push sent; budget cap hit → push sent).
- Out of scope to *trigger* re-auth from the notification; it only informs (deep-link to the PWA banner from F-011).

## Design References

| Surface | Components used | New components needed |
|---------|-----------------|-----------------------|
| PWA header / settings | AppHeader, Toast (from F-010), existing button styles | **Notification opt-in control** (enable/disable + permission-denied guidance) — verify against DESIGN inventory; flag for `/design update` if absent |
| Notification itself | OS-rendered (not a DESIGN component) | — copy/tone only (FR per status) |

> ⚠️ The opt-in control may be a new component not in the DESIGN inventory. Confirm during `/plan`; run `/design update` before `/implement` if it is missing.

## Error Scenarios

| Scenario | Handling |
|---|---|
| `Notification.permission` denied | PWA shows guidance; on iOS, reminds to install to home screen first (R8). No subscription created. |
| Push endpoint returns 410 Gone / 404 | Minion prunes the dead subscription from Firestore; logs warning; run unaffected. |
| `pywebpush` send raises (network/VAPID) | Soft fail: log warning, run status unchanged (PRD §275, §285). |
| Run is `skipped: no_sources` | No push sent (FR-E2, PRD §267). |
| No subscriptions stored | No-op send; run succeeds. |
| iOS PWA not home-screen installed | `PushManager.subscribe` unavailable / permission unobtainable; opt-in control surfaces the install prerequisite (R8/R11). |

## Acceptance Criteria

- [ ] AC-1: VAPID public key reaches the PWA via `VITE_VAPID_PUBLIC_KEY`; private key granted to Minion SA via `infra/iam.tf` (`vapid-private-key` in `minion_runtime_secrets`). Neither key in source.
- [ ] AC-2: From the installed PWA, the opt-in control requests permission and creates a `PushSubscription`; the subscription is persisted to Firestore.
- [ ] AC-3: Firestore Rules allow the allowed operator to write only their own `pushSubscriptions` doc and deny everyone else; existing read-only article/run rules and global deny-by-default unchanged (rules tests cover this).
- [ ] AC-4: Service worker handles `push` (renders a notification) and `notificationclick` (focuses/opens the PWA), verified in an automated SW test where feasible.
- [ ] AC-5: On a `success` / `success_with_warnings` run, the Minion sends a Web Push to each stored subscription with a status-appropriate payload (unit test with mocked `pywebpush`).
- [ ] AC-6: **No** push is sent when the run is `skipped: no_sources` (unit test).
- [ ] AC-7: A `failure` run sends a "run failed" push (unit test).
- [ ] AC-8: A 410/404 from the push endpoint prunes that subscription; a generic send error logs a warning and leaves run status unchanged (unit test). Push failure never flips a run to `failure`.
- [ ] AC-9: shared schema for the subscription doc exists and codegen output (TS + Pydantic) is committed and in sync (`pnpm check:codegen`).
- [ ] AC-10: Notification reliably delivered on a **real** iPhone (iOS 16.4+, home-screen installed) — **deferred to F-013 device pass** (OQ-4) per the F-009/F-010 precedent. Never simulate iOS in Chrome DevTools (R11).

## Out of Scope

- Multi-device / multiple subscriptions per operator beyond what falls out of the endpoint-keyed upsert (mono-tenant; one operator).
- Rich/actionable notifications (action buttons, images) beyond title + body + deep-link.
- Notification preferences/quiet-hours UI beyond the no_sources silence rule.
- Android / desktop push polish (iOS Safari is the target per PRD §5).
- Re-auth *action* from the notification (F-013 runbook territory); FR-6 only informs.

## Open Questions (resolved)

- **OQ-1** ✅ SW strategy → **`injectManifest` + custom `src/sw.ts`** (`precacheAndRoute(self.__WB_MANIFEST)` + push/notificationclick handlers). The existing app-shell precache + hero-image runtime caching move into the custom SW.
- **OQ-2** ✅ `no_sources` is `StepResult(terminal_status=skipped, reason="no_sources")` from step 3 `validate_input` (`ingestion.py:109`); the orchestrator persists it to the run doc as `status=="skipped"` + `error=="no_sources"` via `finalize_run`. **Key finding**: terminal exit halts remaining steps, so `PublishStep` (step 9) runs only on the full-success path and never on `skipped`/`failure`. → the push sender must live in the **orchestrator after `finalize_run`** (it sees the terminal status + reason for every path), not in `PublishStep`. FR-5/FR-6 re-homed accordingly; see plan AD-1.
- **OQ-3** ✅ `pushSubscriptions/{hash(endpoint)}`; doc carries `operatorEmail` so the rules `create`/`update` guard can assert ownership.
- **OQ-4** ✅ AC-10 (real-device delivery) **deferred to F-013** device pass, matching the F-009/F-010 precedent. Automated tests gate this track.
- **OQ-5** ✅ Notification copy: plan pins the shape (title/body per status + deep-link); final French strings chosen at `/implement`.
