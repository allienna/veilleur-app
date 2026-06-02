# Review: Imagen 4 Fast + GitHub publish

**Spec**: specs/006-imagen-github-publish/spec.md
**Plan**: specs/006-imagen-github-publish/plan.md
**Reviewed**: 2026-06-02
**Verdict**: ✅ **Ready to merge**

## 1. Task completion

All **18/18** tasks across the 3 phases are checked in `tasks.md`. No partial or skipped work.

## 2. Quality gates (constitution §5)

Run from `minion/`:

| Gate | Result |
|------|--------|
| `uv run ruff check .` | ✅ All checks passed |
| `uv run ruff format --check .` | ✅ 82 files formatted |
| `uv run pyright` | ✅ 0 errors, 0 warnings |
| `uv run pytest` | ✅ 146 passed, 2 deselected (the gated `integration` tests) |
| Wheel asset packaging | ✅ `placeholder.webp` confirmed present in the built wheel |

The allowed-email invariant is untouched (F-006 is Python-only, no `firestore.rules` / `auth.ts` /
`config.ts` changes). No new dependencies (`pillow`/`google-genai`/`httpx` already present). No
secrets in source — the GitHub PAT and OAuth token are read from Secret Manager at runtime.

## 3. Spec acceptance criteria → evidence

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: imagen → WebP + back-fill `frontmatter.image` | ✅ | `test_imagen_step.py::test_happy_generation_writes_artifact_and_backfills_image` (brand template appended, filename `{date}.webp`) |
| AC-2: moderation reject → rewrite → placeholder + `success_with_warnings` | ✅ | `test_imagen_step.py::test_rejection_exhausted_falls_back_to_placeholder_with_warning`; e2e `test_full_fake_pipeline_imagen_fallback_yields_warnings` |
| AC-3: idempotent two-file commit (update-with-sha) | ✅ | `test_github_step.py::test_commits_markdown_and_image_to_configured_paths`, `::test_replay_overwrites_same_paths` |
| AC-4: GitHub 3× retry → hard fail, artefact persisted first | ✅ | `test_github_step.py::test_retries_then_succeeds`, `::test_retries_exhausted_hard_fails_with_article_already_persisted` |
| AC-5: `publish` persists article idempotently; web-push stubbed | ✅ | `test_publish_step.py` (published=True, commit_sha, idempotent by date) |
| AC-6: orchestrator `success_with_warnings` + precedence | ✅ | `test_warning_propagation.py` (downgrade, failure/terminal override, first-latched) |
| AC-7: ports + fakes, green hermetic CI | ✅ | full suite green with no Vertex/GitHub/Claude/network; real paths under `@pytest.mark.integration` only |
| AC-8: first green full publishable-article run | ✅ | `test_publish_integration.py::test_full_fake_pipeline_publishes_article` (article doc + 2 commits + hero bytes) |

## 4. Plan adherence & deviations

- **AD-1…AD-7 followed.** New `publish/` subpackage; three injected ports; `ArticleStore`;
  `StepResult.warning` latch; persist-before-commit (FR-6); dependency-free serializer;
  `ArticleDoc` kept Minion-internal.
- **Intentional deviation (documented):** plan T-3.2 said "remove the imagen/github/publish
  entries from `stubs.py`". Doing so would break `build_stub_steps()` and the orchestrator's
  default `STEPS` (used by `test_orchestrator.py` for generic lifecycle coverage). Following the
  established F-004/F-005 pattern, the **stubs are retained as the orchestrator default**, while
  `build_pipeline` overrides all nine slots with real steps — so the *production* pipeline has no
  stubs (verified by `test_steps.py::test_build_pipeline_wires_real_steps_and_keeps_order`). This
  satisfies the intent ("no remaining stub steps" in the real pipeline) without regressing tests.
- **Adjacent test updates:** `build_pipeline`'s widened signature required updating
  `test_steps.py`, `test_generation_pipeline.py`, `test_ingestion_pipeline.py`, and `test_cli.py`
  (new fakes/stores). All pass.

## 5. Notes / follow-ups (non-blocking)

- **GitHub target repo** is the migration placeholder `allienna/veilleur-app@main` (plan AD-5 /
  Open Q#2). Switching to the real `allienna/veilleur` is a one-constant change tracked for
  F-007/F-013.
- **`ArticleDoc` is Minion-internal.** When F-009 (PWA reading) consumes `articles/{date}`,
  consider promoting it to a shared `shared/schema/article.json` for a typed cross-boundary
  contract (plan AD-7).
- **Firestore article-write retry:** the `publish`/`github` Firestore writes are single-shot; a
  raise hard-fails the run (consistent with F-003's store behaviour). PRD §6's "3 retries on
  Firestore write failure" is best handled at the client/infra layer in F-007 rather than per
  step — noted for that track.
- **`spike/imagen.py` and `spike/github.py`** remain in place (pyright-excluded) per plan FR-9;
  deletion is scheduled for F-013.
