# Tasks: Hardening + 7-day burn-in + demo prep

**Plan**: specs/013-hardening-burn-in/plan.md
**Status**: Ready
**Total**: 14 tasks across 4 phases

> Most of this track is docs + recorded evidence (burn-in log, device measurements, video), not unit tests. Only Phase 2 adds testable code. CI suites stay green as the regression guard (AC-11).

## Phase 1: Docs hardening (offline, no live creds)

- [x] **T-1.1**: Expand Gmail re-auth runbook in `infra/RUNBOOK.md` §3
  - **Do**: Rewrite the §3 Gmail section into a standalone, followable procedure — re-consent flow, regenerate the refresh token, update Secret Manager (which secret name, which gcloud command). No prior context assumed.
  - **Test**: Read top-to-bottom; every step has a concrete command or click-path, no "see elsewhere" gaps. Satisfies AC-1 (doc side).

- [x] **T-1.2**: Add Anthropic / Claude Code OAuth re-auth + API-key fallback to `infra/RUNBOOK.md` §3
  - **Do**: Document headless `CLAUDE_CODE_OAUTH_TOKEN` re-auth, and the API-key fallback path (R1) for when OAuth is unavailable — which env var/secret, how the Minion image picks it up.
  - **Test**: Both paths (OAuth refresh + API-key fallback) present and self-contained. Satisfies AC-2.

- [x] **T-1.3**: Create top-level `README.md` (FR-G1 narrative entry point)
  - **Do**: New `/README.md` — what Veilleur is, the PRD → constitution → roadmap → specs → implementation chain, how to read the repo, per-workspace run instructions (pnpm/uv), link to **`specs/roadmap.md`** (not phantom `ROADMAP.md`) and `infra/RUNBOOK.md`.
  - **Test**: All links resolve to real files; per-workspace commands match CLAUDE.md. Satisfies AC-6.

- [x] **T-1.4**: Reconcile `specs/roadmap.md` statuses with shipped reality
  - **Do**: Flip F-002/004/005/006/007/008/011 "In Progress" → "Complete"; set F-013 status per workflow. Update §Status drift note.
  - **Test**: `grep -c "In Progress" specs/roadmap.md` reflects only genuinely-active tracks. Satisfies AC-7 (status side).

- [x] **T-1.5**: Verify every track folder has spec/plan/tasks/review
  - **Do**: Audit `specs/[0-9]*/` for missing artefacts; backfill any gap (this track's tasks.md created here; review.md follows in `/review`). Note any intentional absence.
  - **Test**: `for d in specs/[0-9]*; do ls $d/{spec,plan,tasks}.md; done` — no missing for merged tracks. Satisfies AC-7 (coherence side).

- [x] **T-1.6**: Reconcile stale `minion/src/minion/config.py` publish-repo comments (AD-4)
  - **Do**: Edit comments at config.py lines ~105, ~138-139, ~142 — clarify the `veilleur-app`→`veilleur` flip is a documented post-talk step, NOT F-013 work. No constant value change.
  - **Test**: `cd minion && uv run ruff check . && uv run pyright` green; no behavior change.

- [x] **T-1.7**: Cross-link per-workspace READMEs to runbook + top-level README
  - **Do**: In `minion/README.md` + `pwa/README.md`, add links to `infra/RUNBOOK.md` re-auth section + the new top-level README; verify their run instructions match shipped code.
  - **Test**: Links resolve; commands runnable as written.

## Phase 2: PWA auth-banner wiring (the only real code)

- [x] **T-2.1**: Map auth-failure run state → re-auth runbook link in `ErrorBanner`
  - **Do**: In the failure-handling path (`pwa/src/.../Run.tsx`/`Supervision.tsx` caller of `ErrorBanner.tsx`), detect auth-related run error and render the banner `action` linking the Gmail re-auth runbook. Generic failures unchanged. No new component.
  - **Test**: `pnpm --filter @veilleur/pwa run typecheck && pnpm --filter @veilleur/pwa run lint` green.

- [x] **T-2.2**: Component test for auth-failure banner link
  - **Do**: In `pwa/src/components/components.test.tsx` add cases — auth-failure run → banner shows runbook link with correct href; non-auth failure → generic message, no link; `success_with_warnings` → no banner; unknown error code → generic fallback, no crash.
  - **Test**: `pnpm --filter @veilleur/pwa run test`. Completes AC-1 (banner-link side).

## Phase 3: Burn-in + on-device verification (needs live prod + iPhone)

- [x] **T-3.1**: Create `burn-in-log.md` and seed the rolling window
  - **Do**: New `specs/013-hardening-burn-in/burn-in-log.md` with table (date, runId, status, cost, duration, notes) + the ≥7-consecutive / ≥10/13 bar stated. Backfill any already-landed production runs.
  - **Test**: Table renders; bar + counting rule documented (`success_with_warnings` = success, noted).

- [ ] **T-3.2**: Run daily + top-up to ≥7 consecutive / ≥10/13, log each
  - **Do**: Let cron fire + manual top-up via RunNowButton / `gcloud run jobs execute`; append each run to `burn-in-log.md`. Any failure → root-cause line, fix in-track if code/config bug, reset consecutive counter.
  - **Test**: Log shows ≥7 consecutive successes and ≥10/13 window with runId/status/cost/duration each. Satisfies AC-3.

- [ ] **T-3.3**: Verify deferred device ACs on real iPhone → `device-verification.md`
  - **Do**: New `specs/013-hardening-burn-in/device-verification.md`. On real iPhone (16.4+, home-screen install, never simulated — R11) measure: F-009 AC-9 cold-start LCP ≤2s (ceiling 3s), F-010 AC-7 share flow ≤30s, F-012 AC-10 push delivered on run completion. Record measured values + iOS/device version. Miss → document + decide fix-vs-accept.
  - **Test**: Three measured values recorded with pass/fail vs target. Satisfies AC-8, AC-9, AC-10.

## Phase 4: Demo prep (by M10, 2026-06-09)

- [x] **T-4.1**: Write `demo-runbook.md` with live/pre-baked/fallback table (R5)
  - **Do**: New `specs/013-hardening-burn-in/demo-runbook.md` — each demo step marked live / pre-baked / fallback, naming the degradation artefact per live step (Firestore console, already-published morning article, git history, `specs/`). iPhone airplane-mode note for non-demo apps.
  - **Test**: Every live step has a named fallback; no single-point-of-failure on live network. Satisfies AC-5.

- [ ] **T-4.2**: Record tight 2-3 min demo-path backup video + link it
  - **Do**: Record demo-path flow (PWA open → supervise/trigger → read article → LinkedIn share + brief spec-coding narrative). Store offline-retrievable; link from `demo-runbook.md`.
  - **Test**: Video retrievable offline by 2026-06-09; pointer in `demo-runbook.md`. Satisfies AC-4.

- [ ] **T-4.3**: Final CI regression guard (AC-11)
  - **Do**: Run full suites after all changes land.
  - **Test**: `pnpm lint && pnpm typecheck && pnpm check:email && pnpm check:codegen` and `cd minion && uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest` all green. Satisfies AC-11.
