# Review: Push notifications (Web Push + VAPID)

**Spec**: specs/012-push-notifications/spec.md
**Plan**: specs/012-push-notifications/plan.md
**Reviewed**: 2026-06-03
**Verdict**: ✅ **Ready to merge**

## Task completion

All 16 tasks across 4 phases implemented and checked in `tasks.md`.

## Quality gates (all green)

| Gate | Result |
|---|---|
| `pnpm check:codegen` | OK (schema → TS + Pydantic in sync) |
| `pnpm check:email` | OK (still exactly 3 allowed-email pins) |
| `pnpm typecheck` (incl. `tsconfig.worker.json`) | OK |
| `pnpm build` | OK (`dist/sw.js` emitted, injectManifest, 19 precache entries) |
| eslint (pwa, trigger-api) | OK (shared has no lint script) |
| pwa vitest | 89 passed |
| trigger-api node:test | 14 passed |
| `pnpm test:rules` (emulator) | 20 passed |
| minion ruff + format + pyright | clean (0 errors) |
| minion pytest | 168 passed |

## Spec acceptance criteria

- **AC-1** VAPID keys: private → `vapid-private-key` granted to Minion SA (`infra/iam.tf`); public → `VITE_VAPID_PUBLIC_KEY`. No key in source. ✅
- **AC-2** PWA opt-in creates + persists a `PushSubscription`. ✅
- **AC-3** Rules: operator writes only its own `pushSubscriptions` doc; deny otherwise; articles/runs + deny-by-default unchanged. ✅ (20 rules tests)
- **AC-4** SW `push` → notification + `notificationclick` → focus/open. ✅ (`pushHandlers.test.ts`)
- **AC-5** success / success_with_warnings → push per subscription. ✅
- **AC-6** `skipped`+`no_sources` → no push. ✅
- **AC-7** failure → "run failed" push naming the step. ✅
- **AC-8** 410/404 prunes sub; other errors → warning, run status unchanged; never raises. ✅
- **AC-9** shared schema + codegen committed and in sync. ✅
- **AC-10** real-iPhone delivery — **deferred to F-013 device pass** (OQ-4). Never simulate iOS in DevTools (R11).

## Architecture-decision validation

- **AD-1** Push send re-homed from the success-only `PublishStep` into the orchestrator after `finalize_run`; verified it fires on success / skipped / failure paths and that `aborted` (early-return before the try) never reaches it. ✅
- **AD-2** `WebPushNotifier` swallows every send error and prunes dead subs — `notify` cannot propagate into `run_pipeline`. ✅
- **AD-3** `injectManifest` + custom `src/sw.ts`; app-shell precache + hero-image `StaleWhileRevalidate` faithfully re-homed; worker isolated in `tsconfig.worker.json` (WebWorker lib). ✅
- **AD-4** `pushSubscriptions/{sha256(endpoint)}`, idempotent upsert. ✅
- **AD-5** Ownership-scoped rule resists spoofed `operatorEmail`, non-allowed email, unverified, unauthenticated, and cross-owner update. ✅

## Findings (from adversarial review) — both fixed

1. **Important** — `pwa/src/sw.ts` `notificationclick` focused the first arbitrary window before checking its URL. **Fixed**: now prefers a window already on the target route, else reuses/navigates the first, else opens a new one.
2. **Important** — `cli.py` created a second `firestore.Client()` for the notifier. **Fixed**: a single `build_firestore_client()` is shared by `build_stores` and `build_notifier`.

No critical issues. No unresolved findings.

## Notes carried forward

- AC-10 device verification → F-013 burn-in (matches F-009/F-010 precedent).
- New runtime deps reviewed: `pywebpush` (+ `py-vapid`, `cryptography`, `http-ece`) on the Python side; `workbox-{precaching,routing,strategies,expiration}` on the PWA side.
