# Review: Hello-Veilleur spike

**Date**: 2026-05-26
**Reviewer**: Claude Code (automated)

## Task Completion
- Total: 24 | Completed: 24 | Blocked: 0

## Acceptance Criteria
| # | Criterion | Status | Notes |
|---|---|---|---|
| AC-1 | Reproducible `linux/amd64` build from clean clone | PASS | Fresh `/tmp` clone built + `--help` worked |
| AC-2 | Local run → Firestore doc with all fields | PASS | `spike-local.sh`; doc `spike-2026-05-26-c1fdd8ba` |
| AC-3 | Cloud Run Job execution → equivalent doc | PASS | doc `spike-2026-05-26-5b88f35e`, all 7 fields |
| AC-4 | GitHub commit from local + cloud, SHA in Firestore | PASS | commit `99f57290` on `allienna/veilleur-app` (migration target) |
| AC-5 | `claude-probe` exits 0 in deployed container, no `ANTHROPIC_API_KEY` | PASS | **R1 CLOSED** — `claude_probe=ok` in deployed Job ×2 |
| AC-6 | No `print()` outside log boundary | PASS | ruff `T20` clean |
| AC-7 | `terraform apply` idempotent + secret script no-op | PASS | `terraform plan` → No changes; script exits 0 |
| AC-8 | Per-secret IAM, no project-wide secret access | PASS | SA project roles = `aiplatform.user`, `datastore.user` only |
| AC-9 | `minion/README.md` runbook, no placeholders | PASS | `grep -E '<.*>'` clean |
| AC-10 | Cloud run < 5 min | PASS | ~57s end-to-end |

## Architecture Compliance
| Decision | Followed? | Notes |
|---|---|---|
| AD-1 two CLI subcommands | PASS | `run` + `claude-probe` |
| AD-2 single Pydantic record | PASS | `SpikeRunRecord` |
| AD-3 stdlib + python-json-logger | PASS | + third-party/gRPC noise silenced |
| AD-4 multi-stage amd64 Dockerfile | PASS | amended: non-root `minion` user (see Issues) |
| AD-5 ADC local / WI cloud | PASS | both verified |
| AD-6 SDKs + direct GitHub httpx | PASS | — |
| AD-7 Terraform from F-001 | PASS | local state; reversal documented |
| AD-8 runId `spike-{date}-{8hex}` | PASS | — |
| AD-9 hardcoded mascot prompt | PASS | 181 chars |
| AD-10 commit path quarantined `spikes/` | PASS | repo corrected to `veilleur-app` (migration) |

## Quality Gates
| Check | Status | Details |
|---|---|---|
| Test | SKIP | No unit tests by design (plan §Test Strategy — acceptance is the live run); no test cmd in CLAUDE.md (absent until F-002) |
| Lint | PASS | `ruff check minion/src` — all checks passed |
| Format | PASS | `ruff format --check` — clean |
| Type check | PASS | `pyright minion/src` — 0 errors (strict) |
| Terraform | PASS | `validate` + `fmt -check` clean; `plan` idempotent |

## Spec Compliance
| Check | Status | Notes |
|---|---|---|
| Error handling | PASS | Fail-fast per step; Imagen block is the one non-fatal path (matches spec error table) |
| Codebase patterns | N/A | No CLAUDE.md yet (F-002); ruff/pyright config in pyproject enforced |
| Design tokens applied | N/A | `minion` surface, no UI (plan Design References = N/A) |
| Component inventory respected | N/A | No UI |
| State coverage | N/A | No UI |
| A11y baseline | N/A | No UI |

## Constitution Compliance
| Principle | Status | Notes |
|---|---|---|
| 1. Single allowed identity | N/A | No PWA/Firestore-rules/trigger-api yet (F-008/F-009/F-011) |
| 2. OAuth-by-default Anthropic | PASS | `secrets.py` import guard rejects `ANTHROPIC_API_KEY`; claude-probe uses `CLAUDE_CODE_OAUTH_TOKEN` only |
| 3. No secrets in source | PASS | All in Secret Manager; `.gitignore` excludes `.env`; only illustrative placeholders in runbook |
| 4. Transformative use | N/A | No article generation in spike |
| 5. Hard caps per run | N/A | No generation step |
| 6. 20-min hard timeout | PASS | Cloud Run Job `timeout = "1200s"` |
| 7. Idempotent runs | PASS (partial) | GitHub commit idempotent by date; spike runId carries a random suffix so each invocation is a distinct doc — full date-idempotency lands with the real pipeline (F-003) |
| 8. Concurrency guard | N/A | Firestore lock is F-003 |
| 9. Observable steps | PASS | One structured JSON line per step (`step`, `status`, `duration_ms`) |
| 10. Budget kill-switch | N/A | F-007 |
| 11. No third-party PII | PASS | Gmail probe stores only an unread count; no analytics |
| §4 Pydantic / uv / ruff / no-print / Conventional Commits / typed | PASS | All; 0 non-conventional commits on branch; uv.lock committed |

## Issues Found
| Severity | Description | Fix |
|---|---|---|
| Info | **Non-root user** required in Dockerfile — `claude -p --permission-mode bypassPermissions` refuses to run as root. Surfaced at the R1 gate; fixed (uid 1000 `minion`). | Done; documented in README + memory. Carries to F-003 image. |
| Info | **PRD §8 repo error** — `allienna/allienna.github.io` doesn't exist; real repo is `allienna/veilleur`. Spike writes to `allienna/veilleur-app` during migration. | F-001 corrected; PRD §8 should be fixed in a docs pass. |
| Info | **No unit tests** — intentional per plan (acceptance = live run). Real tests begin F-003. | Accept for spike. |
| Low | **Spike artifacts on `veilleur-app/main`** — probe images committed under `site/public/images/spikes/` + `runs/` docs in prod Firestore. | Cleanup (`git rm -r site/`, prune Firestore) when switching to the real target or before F-002. |

## Verdict
**Ready to merge** — all 10 ACs pass, all quality gates green, every constitution principle in scope for a plumbing spike satisfied. The headline objectives (R1 + R9 closure) are achieved and verified in the deployed Cloud Run Job. Issues found are informational/low: intentional scope boundaries and documented deviations, not defects.
