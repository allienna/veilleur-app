# Spec: Hardening + 7-day burn-in + demo prep

**Track ID**: 013-hardening-burn-in
**Roadmap ref**: F-013
**Status**: In Progress
**Created**: 2026-06-03
**Branch**: feat/013-hardening-burn-in
**PRD sections**: §9 Phase 4 M8–M11, FR-G1 (narrative side), §10 R3 + R5 mitigation, §4 Reliability
**Depends on**: F-012 (Complete — reviewed Ready to merge)

## Context

The pipeline is feature-complete: Minion runs end-to-end (F-001→F-008), the PWA reads/shares/supervises/triggers (F-009→F-011), and push notifications close the loop (F-012). What remains before the DevLille talk (M11, 2026-06-11) is **proving it holds up over time** and **making the repo defensible as a spec-coding exemplar**.

This track is not new product surface. It is hardening: verify the deferred device-level acceptance criteria from F-009/F-010/F-012 on a real iPhone, run the burn-in window required by the PRD reliability bar, write the operational runbooks the risk register promised (R3 re-auth, R5 demo degradation), record the backup demo video, and polish README + `specs/` + git history so the audience finds a coherent spec-driven narrative.

Calendar reality (re-baselined roadmap): today is **2026-06-03**. M8 burn-in target **2026-06-05**, M10 backup video **2026-06-09** (J-2), M11 talk **2026-06-11**. The burn-in window is ~13 days, so the PRD's "≥18/21 OK" bar relaxes to "≥10/13" (equivalent quality, less statistical confidence). Burn-in must start immediately — every day not in production is a day lost from the window.

**Note**: the reserved live-demo track stub (FR-G1 *track* side, F-014) is a separate feature. This track covers FR-G1's *narrative* side only (repo defends itself).

## User Stories

- As the operator, I want a documented re-auth runbook for Gmail and Anthropic OAuth so that when a token is revoked I can recover the pipeline without reverse-engineering it under pressure.
- As the operator, I want 7+ consecutive successful daily production runs verified so that I trust the pipeline to run unattended through the talk.
- As the speaker, I want a pre-recorded backup demo video so that a stage network/OAuth failure (R5) does not sink the talk.
- As the speaker, I want the demo to degrade gracefully so that the artefacts (`specs/`, git history, Firestore console, already-published morning article) tell the story even with zero live action.
- As the DevLille audience, I want to read `README.md`, `specs/`, `CLAUDE.md`, and the git history and find a coherent, defensible spec-driven narrative so that the talk's thesis is materially proven (FR-G1).
- As the operator, I want the deferred device-level ACs (PWA LCP, share flow, push delivery) verified on a real iPhone so that the on-device experience is confirmed, not assumed.

## Functional Requirements

### FR-1: Re-auth runbooks (R3 mitigation)
Document step-by-step recovery procedures for the two OAuth credentials the pipeline depends on:
- **Gmail OAuth refresh token revocation** — how to re-consent, regenerate the refresh token, and update Secret Manager.
- **Anthropic / Claude Code OAuth (`CLAUDE_CODE_OAUTH_TOKEN`)** — how to re-auth headless, and how to fall back to the Anthropic API key path (R1) if OAuth is unavailable.
Each runbook lives in the repo (location decided in `/plan`; likely `minion/` or a top-level `docs/`), is linked from README, and is concrete enough to follow without prior context. The PWA auth-expired banner (already shipped) must link to the Gmail runbook.

### FR-2: 7-day burn-in verification (M8, §4 Reliability)
Run the pipeline in production daily and record outcomes on a rolling window. Target: **≥7 consecutive successful runs** (publishable article without intervention), and on the full window **≥10/13 OK** (re-baselined from the PRD's ≥18/21). A lightweight burn-in log (date, runId, status, cost, duration, notes) is maintained in the repo. `success_with_warnings` counts as success for the publishability bar but is noted. Failures get a root-cause line.

### FR-3: Backup demo video (M10, J-2, R5 mitigation)
Record a backup video of the full demo flow (PWA open → supervise/trigger a run → read article → LinkedIn share, plus the spec-coding narrative walk). Stored where it's retrievable on stage offline. This is an operator/speaker deliverable; the spec tracks its existence and the acceptance bar, not the editing.

### FR-4: Graceful-degradation demo plan (R5)
Document the demo runbook: the sequence, what is live vs pre-baked, and the fallback at each step (network down → show Firestore console + already-published morning article + git history + `specs/`). iPhone in airplane mode for non-demo apps. The plan must make every live step optional.

### FR-5: Repo defensibility pass (FR-G1 narrative side)
Sanity pass so the repo reads as a spec-coding exemplar:
- **README.md** polished as the entry point — what the project is, the PRD→constitution→roadmap→specs→implementation chain, how to read the repo, how to run each workspace. (Note: roadmap references `ROADMAP.md`; the actual file is `specs/roadmap.md` — README must point to the real path.)
- **`specs/`** coherent — every track has spec/plan/tasks/review; roadmap statuses reconciled with reality (several entries still say "In Progress" though their features merged — see Open Questions).
- **git history** scannable — Conventional Commits, feature-scoped, tells the build story.
- **`CLAUDE.md`** accurate against the shipped code.

### FR-6: Deferred device-AC verification
Verify on a real iPhone (never simulated — R11) the device-level ACs deferred into this track:
- **F-009 AC-9**: PWA cold-start LCP ≤2s on iPhone 4G (hard ceiling 3s).
- **F-010 AC-7**: ≤30s flow from PWA-open to LinkedIn-paste-ready on iOS.
- **F-012 AC-10**: push notification actually delivered to the home-screen-installed PWA on run completion.
Record measured values in the burn-in log or a device-verification note. If a target is missed, file the gap (fix in-track if cheap, else note as known limitation for the talk).

## Error Scenarios

- **Burn-in run fails mid-window**: record root cause; if it reveals a code/config bug, fix it in-track (hardening is the point) and reset the consecutive-success counter. Do not silently drop failures from the log.
- **Ingestion scraper insufficient (observed 2026-06-04)**: the first burn-in runs hard-failed the ≥50%/≥5 gate at 17/46 then 1/31 sources OK (0 paywalled, all HTTP-level failures — Jina free-tier rate-limiting, not a thin-news day). This is an architecture-level fix, not an in-track tweak: the scraper engine is replaced (Jina → local extraction) under its own track **F-015**, with the PRD §5 scraping decision amended accordingly. F-013 burn-in **resumes once F-015 lands**; the consecutive-success counter starts from the first clean post-F-015 run.
- **Device AC misses target**: document measured value; decide fix-vs-accept explicitly rather than hiding the miss.
- **OAuth token revoked during burn-in**: this is the runbook's first live test — follow FR-1, time the recovery, fold lessons back into the runbook.
- **Imagen moderation `success_with_warnings` accumulates**: per R2, counts as success but noted; if frequent, flag the prompt template as a known issue.

## Acceptance Criteria

- [ ] AC-1: Gmail re-auth runbook exists in-repo, linked from README and from the PWA auth-expired banner, and is followable end-to-end.
- [ ] AC-2: Anthropic/Claude Code OAuth re-auth runbook exists, including the API-key fallback path.
- [ ] AC-3: Burn-in log in-repo shows ≥7 consecutive successful production runs and ≥10/13 OK on the rolling window, each with runId/status/cost/duration.
- [ ] AC-4: Backup demo video recorded and retrievable offline by 2026-06-09 (M10).
- [ ] AC-5: Graceful-degradation demo runbook documents every step's live/pre-baked status and fallback; no step is single-point-of-failure on live network.
- [ ] AC-6: README polished — points to the real `specs/roadmap.md`, explains the spec chain, and gives correct per-workspace run instructions.
- [ ] AC-7: Roadmap statuses reconciled with shipped reality; every track folder has spec/plan/tasks/review present.
- [ ] AC-8: F-009 AC-9 (LCP ≤2s) verified on real iPhone, measured value recorded.
- [ ] AC-9: F-010 AC-7 (≤30s share flow) verified on real iPhone, measured value recorded.
- [ ] AC-10: F-012 AC-10 (push delivered) verified on home-screen-installed PWA, recorded.
- [ ] AC-11: `pnpm lint`/`pnpm typecheck` and `minion` ruff/pyright/pytest still green (no hardening regressions); allowed-email invariant + codegen-sync CI still pass.

## Out of Scope

- The reserved live-demo track stub itself (FR-G1 track side) — that is F-014.
- New product features or UI surfaces — this track is hardening/docs/verification only.
- Production infra changes beyond what burn-in reveals as necessary (deploy/scheduler shipped in F-007).
- Slide deck / talk script authoring — speaker deliverable, not repo scope.
- Retroactive fixes to merged features unless burn-in surfaces a real defect.

## Open Questions

- **Burn-in window vs calendar**: today is 2026-06-03; 7 consecutive successful runs by M10 (2026-06-09) leaves ~6 daily cron fires plus manual triggers. Is the relaxed "≥7 consecutive / ≥10/13" bar accepted, or do we want manual top-up runs to pad the window? (Roadmap §Calendar already proposed ≥10/13 — confirm.)
- **Runbook location**: top-level `docs/` vs `minion/README` vs repo README appendix? `/plan` decides.
- **Roadmap status drift**: F-002/004/005/006/007/008/011 still read "In Progress" though merged. Reconcile in this track (part of FR-5), or is that a separate cleanup? Recommend reconciling here since FR-G1 demands a coherent repo.
- **Backup video scope**: full ~10-min walkthrough vs tight 2-3 min demo-path-only? Affects what "recorded" means for AC-4.
- **Device testing access**: confirm a real iPhone (16.4+, home-screen install) is available for FR-6 within the window.
