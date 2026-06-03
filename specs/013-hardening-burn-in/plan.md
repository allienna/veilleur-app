# Plan: Hardening + 7-day burn-in + demo prep

**Spec**: specs/013-hardening-burn-in/spec.md

This track is ~80% documentation, operations, and on-device verification, ~20% small code/config wiring. The pipeline already runs in production (F-007) and `infra/RUNBOOK.md` §3 already sketches OAuth re-auth — most "build" here is *hardening, linking, and evidence-gathering*, not new logic. Decisions confirmed during planning: burn-in bar **≥7 consecutive + manual top-up**; backup video **tight 2-3 min demo-path**; **real iPhone 16.4+ available**.

## Architecture Decisions

### AD-1: Re-auth runbooks extend `infra/RUNBOOK.md` §3, not a new doc
- **Choice**: Harden the existing `infra/RUNBOOK.md` §3 "OAuth re-auth (Gmail / Anthropic)" rather than create `docs/`. Add the missing **Anthropic API-key fallback (R1)** path, make each procedure self-contained and followable, and link it from the new top-level README + per-workspace READMEs + the PWA auth-expired banner.
- **Rationale**: One operational doc already exists and is where the operator looks. A second `docs/` location fragments ops knowledge. RUNBOOK already carries the account precondition + kill-switch + replay — re-auth belongs beside them.
- **Alternatives considered**: New `docs/runbooks/` tree (over-structured for a one-operator project); README appendix (mixes narrative entry-point with ops detail).

### AD-2: New top-level `README.md` is the spec-coding narrative entry point (FR-G1)
- **Choice**: Create `/README.md` (does not exist today). It states what Veilleur is, walks the PRD → constitution → roadmap → specs → implementation chain, links the **real `specs/roadmap.md`** (not the phantom `ROADMAP.md`), and points to each workspace's run instructions + `infra/RUNBOOK.md`.
- **Rationale**: FR-G1 demands the repo defend itself to the DevLille audience. There is no front door today — only per-workspace READMEs. This is the single highest-leverage narrative artefact.
- **Alternatives considered**: Promote `CLAUDE.md` as the entry point (it's agent-facing, not audience-facing); leave README absent (fails FR-G1).

### AD-3: Burn-in evidence + device-AC results live in `specs/013-hardening-burn-in/`
- **Choice**: A committed `burn-in-log.md` (date, runId, status, cost, duration, notes) and a `device-verification.md` (F-009 AC-9 LCP, F-010 AC-7 share-flow, F-012 AC-10 push — measured values + iPhone/iOS version). Evidence (Firestore run docs, commit URLs, screenshots/timings) referenced from there.
- **Rationale**: Track-local evidence keeps the spec-coding narrative coherent (every claim has a receipt in its track). Matches the F-007/F-008 precedent of recording evidence under the track folder.
- **Alternatives considered**: A top-level `BURNIN.md` (detaches evidence from the track that owns it).

### AD-4: Publish-repo flip (`veilleur-app` → `veilleur`) is DEFERRED, documented not executed
- **Choice**: Do **not** flip `GITHUB_REPO_NAME` (minion/config.py:142) during this track. Instead, document the one-constant switch + its prerequisites (external `allienna/veilleur` repo live, its content-collection frontmatter schema reconciled against `REQUIRED_FRONTMATTER_FIELDS` — config.py:105) as a post-talk step, and reconcile the stale code comments that point at F-013.
- **Rationale**: Flipping the publish target mid-burn-in changes where every run writes — it would reset the consecutive-success confidence the burn-in is meant to build, and depends on an external repo + schema not yet reconciled. The talk demo reads articles from Firestore via the PWA, not the live Astro site, so the flip is not on the talk's critical path. Changing it now is pure downside during the window.
- **Alternatives considered**: Flip now (risks burn-in resets + needs external schema work — out of proportion to talk value); leave comments stale (fails FR-5's "CLAUDE/specs/code coherent" bar — so we at least reconcile the comments).

### AD-5: Demo runbook is a track-local doc with an explicit live-vs-prebaked column (R5)
- **Choice**: `specs/013-hardening-burn-in/demo-runbook.md` lists each demo step, marks it **live / pre-baked / fallback**, and names the degradation artefact for every live step (Firestore console, already-published morning article, git history, `specs/`). iPhone airplane-mode note for non-demo apps.
- **Rationale**: R5 mitigation requires the demo to survive zero live network. A per-step fallback table is the concrete form of "degrade gracefully."
- **Alternatives considered**: Prose-only plan (hard to audit that *every* step has a fallback).

## Affected Files

### New Files
| File | Purpose |
|---|---|
| `README.md` (top-level) | FR-5 / FR-G1 narrative entry point; links spec chain, roadmap, workspaces, RUNBOOK. |
| `specs/013-hardening-burn-in/burn-in-log.md` | FR-2 rolling burn-in evidence table. |
| `specs/013-hardening-burn-in/device-verification.md` | FR-6 measured device-AC results (LCP / share / push) on real iPhone. |
| `specs/013-hardening-burn-in/demo-runbook.md` | FR-3/FR-4 demo sequence + live/pre-baked/fallback table; backup-video pointer. |

### Modified Files
| File | Change |
|---|---|
| `infra/RUNBOOK.md` | FR-1: expand §3 — full Gmail re-consent steps, Anthropic re-auth, **add API-key fallback (R1)**; make followable standalone. |
| `pwa/src/components/ErrorBanner.tsx` (+ caller) | FR-1: when a run fails on an auth-related error, render the banner with an `action` link to the re-auth runbook. Likely a small helper in `Run.tsx`/`Supervision.tsx` mapping failure → runbook link. |
| `minion/src/minion/config.py` | FR-5/AD-4: reconcile stale comments (lines 105, 138-139, 142) — clarify publish-repo flip is a documented post-talk step, not F-013 work. No constant value change. |
| `specs/roadmap.md` | FR-5/AC-7: reconcile statuses (F-002/004/005/006/007/008/011 read "In Progress" though merged → "Complete"); set F-013 per workflow. |
| `minion/README.md`, `pwa/README.md` | FR-1/FR-5: link the re-auth runbook + the new top-level README; verify run instructions match shipped code. |

## Implementation Phases

### Phase 1: Docs hardening (no live creds needed)
- FR-1: expand `infra/RUNBOOK.md` §3 (Gmail full flow + Anthropic + API-key fallback R1).
- FR-5/AD-2: write top-level `README.md` (spec chain, real roadmap path, workspace run instructions, RUNBOOK link).
- FR-5/AD-4: reconcile `minion/config.py` comments + `specs/roadmap.md` statuses; verify every track folder has spec/plan/tasks/review; cross-link per-workspace READMEs.
- AC: AC-1, AC-2 (doc side), AC-6, AC-7. Verifiable offline.

### Phase 2: PWA auth-banner wiring (the only real code)
- FR-1: map an auth-failure run state to an `ErrorBanner` with an `action` linking the Gmail re-auth runbook. Keep it within the existing `ErrorBanner` action slot — no new component.
- Component test asserts the link renders for an auth-failure run and not for generic failures.
- AC: completes AC-1 (banner-link side). `pnpm lint`/`typecheck` green (AC-11).

### Phase 3: Burn-in + on-device verification (needs live prod + iPhone)
- FR-2: run daily (cron + manual top-up) → fill `burn-in-log.md` to ≥7 consecutive successes / ≥10/13 window. Root-cause + fix any failure in-track (reset counter).
- FR-6: on the real iPhone (16.4+, home-screen install) measure LCP (F-009 AC-9 ≤2s), share flow (F-010 AC-7 ≤30s), push delivery (F-012 AC-10) → record in `device-verification.md`. Never simulate iOS (R11).
- AC: AC-3, AC-8, AC-9, AC-10. Evidence-based, spans the window.

### Phase 4: Demo prep (by M10, 2026-06-09)
- FR-4/AD-5: write `demo-runbook.md` with the live/pre-baked/fallback table.
- FR-3: record the tight 2-3 min demo-path backup video; store offline-retrievable; link from `demo-runbook.md`.
- AC: AC-4, AC-5.

## Test Strategy
- **Mocking approach**: Only Phase 2 adds testable code. Reuse the PWA component-test setup (`pwa/src/components/components.test.tsx`, Vitest + Testing Library) — render `ErrorBanner`/the failure mapping with a fake auth-failure run, assert the runbook link; assert generic failures show no link.
- **Happy paths**: auth-failure run → banner shows runbook link with correct href; non-auth failure → existing generic message, no link.
- **Error scenarios**: missing/unknown error code falls back to the generic banner (no crash).
- **Edge cases**: `success_with_warnings` is not a failure → no banner. Most of this track is verified by **recorded evidence** (burn-in log, device measurements, video), not unit tests — the existing CI suites (minion ruff/pyright/pytest, pwa lint/typecheck, email-invariant, codegen-sync) must stay green as the regression guard (AC-11).

## Risk & Complexity
- **Estimated complexity**: Low (docs + ops + one small PWA wiring). Risk is calendar/operational, not technical.
- **Key risks**:
  - **R0 calendar**: ~6 cron fires before M10; the ≥7-consecutive bar depends on manual top-up runs landing cleanly. Mitigation: start burn-in day 1 of this track, top up via RunNowButton/`gcloud run jobs execute`.
  - **R3 live test**: an OAuth revocation mid-burn-in is the runbook's first real exercise — time the recovery, fold lessons back (turns a risk into evidence).
  - **R11 iOS**: device ACs must be measured on the real iPhone; simulated results are invalid and would be a false pass.
  - **AD-4 temptation**: pressure to "finish" the publish-repo flip during burn-in — explicitly deferred; flipping resets confidence and needs external schema work.
- **New dependencies**: none.
