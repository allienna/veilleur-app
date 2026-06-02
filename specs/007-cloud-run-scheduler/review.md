# Review: Cloud Run deployment + Cloud Scheduler + kill-switch

**Spec**: specs/007-cloud-run-scheduler/spec.md
**Plan**: specs/007-cloud-run-scheduler/plan.md
**Reviewed**: 2026-06-02
**Verdict**: ✅ **Pass with notes** (all in-repo artifacts done + verified; the operator-run
production bring-up T-3.5 / AC-8 is pending live GCP credentials, by design)

## 1. Task completion

15/16 tasks done. The one open task, **T-3.5**, is the operational bring-up (`terraform apply` →
secrets → image push → Scheduler enable → first cron run) — explicitly operator-run and outside CI
since the spec/plan/tasks were written. All in-repo, CI-verifiable work is complete.

## 2. Quality gates

| Gate | Result |
|------|--------|
| `docker buildx build --platform linux/amd64 -f minion/Dockerfile .` | ✅ builds |
| `./scripts/image-smoke.sh` | ✅ git, node 20, claude 2.1.150, `/generate` vendored, `minion --help`, non-root uid 1000 |
| `terraform -chdir=infra fmt -check` + `init -backend=false` + `validate` | ✅ valid |
| `functions/budget-killswitch` pytest | ✅ 4 passed |
| minion §5 (ruff / format / pyright / pytest) | ✅ all pass, 147 tests, 0 type errors |
| `pnpm check:email` | ✅ 3-location pin identical |

## 3. Two significant discoveries (resolved)

1. **`/generate` was missing from its declared source.** Constitution §3 / F-005 / F-006 stated
   `/generate` ships from the `allienna/claude-feature-flow` plugin. It does not — that plugin has
   only the generic spec-workflow commands. `/generate` is a **legacy Veilleur v1** command
   (`allienna/veilleur/.claude/skills/generate/`). **Resolution (user-approved):** ported it to
   `minion/.claude/commands/generate.md` (adapted to F-005's `GeneratedArticle` JSON contract +
   `validate.py` copyright rules), vendored into the image, and amended constitution §3/§4 to match.
2. **The Minion image had been unbuildable since F-002.** The Minion depends on `veilleur-shared`
   via a path dependency at `../shared`, outside the `minion/` build context. **Resolution:** build
   from the **repo root** (`-f minion/Dockerfile .`), added a root `.dockerignore`, and reworked the
   Dockerfile to COPY `shared/` + `minion/`. Verified by a real amd64 build + smoke.

Both were latent gaps the first real production build surfaced — exactly what F-007 exists to catch.

## 4. Spec acceptance criteria → evidence

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: amd64 image runs `minion run`, has claude/`generate`/node/git, non-root | ✅ | image-smoke.sh green |
| AC-2: `terraform validate`/`fmt` clean; full stack declared | ✅ | infra validates; job/scheduler/iam/killswitch/outputs present |
| AC-3: Job `minion`/`minion-sa`/`max_retries=0`/`timeout=1200s`/image ignore_changes | ✅ | `infra/job.tf` |
| AC-4: Scheduler `0 6 * * *` Europe/Paris via scheduler-SA `run.invoker` only | ✅ | `infra/scheduler.tf` + `job.tf` binding |
| AC-5: budget→pubsub→function kill-switch in TF | ✅ | `infra/killswitch.tf` + `functions/budget-killswitch/` |
| AC-6: deploy script builds/pushes/bumps idempotently, bootstrap order | ✅ | `scripts/deploy-minion.sh` |
| AC-7: runbook covers apply/secrets/deploy/scheduler/smoke/re-auth/kill-switch | ✅ | `infra/RUNBOOK.md` |
| AC-8: real run publishes + first 06:00 run lands | ⏳ | **operator-run (T-3.5)** — not a CI assertion |

## 5. Plan adherence & deviations

- **AD-1…AD-7 followed**, except **AD-2 superseded**: `/generate` is vendored (discovery #1), not
  plugin-installed. Documented in tasks T-1.2 and the constitution.
- **Decisions honored:** GitHub target stays on the `veilleur-app` placeholder (no code change);
  `infra/` declares only production-new resources (spike state keeps the shared singletons);
  kill-switch pauses the Scheduler only; 2nd-gen Python function; CI `fmt`+`validate` only.
- **Extra (not in the plan, required for correctness):** repo-root build context + root
  `.dockerignore` + the `minion/.dockerignore` `*.md` exception (discovery #2).

## 6. Notes / follow-ups (non-blocking)

- **F-005 date gap:** `generate/runner.py` doesn't pass the run `date` in the context file, so
  `/generate` defaults `frontmatter.date` to today — wrong on replays of past dates. One-line fix to
  `_write_context`; flagged for F-013 or a quick follow-up.
- **Plugin-CLI install** (AD-2 original) is moot now that `/generate` is vendored; the constitution
  reflects this.
- **State consolidation** (merge `infra/spike/` singletons into `infra/`) + the GitHub target flip
  to `allienna/veilleur` + deleting `spike/` are all **F-013**.
- **Apply-time IAM** for the 2nd-gen function's Eventarc/Pub/Sub trigger may need a couple of extra
  role grants surfaced only at `terraform apply`; the runbook covers operating it, and AC-8 will
  confirm.
