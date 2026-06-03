# Demo runbook (F-013 FR-3 / FR-4 / AD-5 — R5 mitigation)

The DevLille demo sequence with an explicit **live / pre-baked / fallback** status per step. The bar
(AC-5): **no step is a single point of failure on live network** — every live step has a named
degradation artefact that tells the same story offline.

## Pre-flight (before going on stage)

- [ ] iPhone (16.4+, PWA installed to home screen) charged; PWA opened once to warm the cache.
- [ ] **Airplane mode for non-demo apps** / notifications silenced; keep only the demo path online.
- [ ] Backup video (FR-3, see below) downloaded **locally** on the laptop — playable with zero network.
- [ ] A **morning article already published** today (the cron run, or a manual top-up) — this is the
      pre-baked anchor every fallback leans on.
- [ ] Firestore console open + authenticated to `veilleur-app` in a browser tab.
- [ ] Repo open locally (`specs/`, git log) — the spec-coding narrative needs no network.

## Demo sequence

| # | Step | Status | If live network dies → fallback artefact |
|---|---|---|---|
| 1 | Open the PWA on the iPhone, sign in | **live** | PWA is offline-capable (service worker); already-cached today's article renders. Show the home-screen install instead of live auth. |
| 2 | Show today's article (read view) | **live → pre-baked** | The morning article is already in Firestore + the service-worker cache — reads with no network. |
| 3 | Trigger a run (RunNowButton → trigger-api) | **live** | Skip the live trigger; narrate it and jump to step 4 using the **already-completed** morning run. |
| 4 | Supervise the live run (real-time timeline) | **live → pre-baked** | Open the morning run at `/runs/{today}` — the completed timeline shows all nine steps + cost/duration, identical UI, no live listener needed. |
| 5 | Push notification on completion | **live** (best-effort) | Do not depend on it on stage (iOS push timing is not guaranteed). Mention it; the backup video shows a real delivery. |
| 6 | LinkedIn share (two-tap: copy post + save image) | **live** | Clipboard + image save are local device ops — work offline once the article is loaded. |
| 7 | Spec-coding narrative walk (`specs/`, the `/generate` slash-command spec, git history) | **pre-baked** | Entirely local — the thesis (`spec → plan → tasks → implement`, runtime executes a versioned spec) needs no network at all. This is the unsinkable core of the talk. |

**Total live network failure** → run steps 2,4,6,7 from cache + console + repo, and play the backup
video for steps 1,3,5. The story holds with zero live action.

## Backup video (FR-3 / AC-4)

- **Scope:** tight **2-3 min** demo-path only (PWA open → supervise/trigger → read → LinkedIn share),
  plus a short spec-coding narrative beat. Not a full walkthrough.
- **Deadline:** recorded + downloaded locally by **2026-06-09 (M10, J-2)**.
- **Storage:** offline-retrievable on the demo laptop (not streamed). Link / file path here once recorded:
  - `TODO: <local path or asset link>` — fill on record, then check AC-4 in `spec.md`.
