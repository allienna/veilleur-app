# Review: Agentic step `/generate` (the talk artefact)

**Spec**: specs/005-agentic-generate/spec.md
**Plan**: specs/005-agentic-generate/plan.md
**Reviewed**: 2026-06-02
**Verdict**: ✅ **Pass with notes**

## Task completion

All 17 tasks across 3 phases are checked in `tasks.md`. Implementation adds the `generate/`
subpackage (7 modules) + `steps/generation.py` + 7 test files, and modifies `config.py`,
`steps/__init__.py`, `cli.py`, `pyproject.toml`, and two F-004 tests. No changes to `shared/`,
the allowed-email pins, the spike, or the PWA/trigger-api workspaces.

## Quality gate (from CLAUDE.md)

| Check | Result |
|-------|--------|
| `uv run ruff check .` | ✅ clean |
| `uv run ruff format --check .` | ✅ 65 files formatted |
| `uv run pyright` | ✅ 0 errors, 0 warnings |
| `uv run pytest` | ✅ 114 passed, 1 deselected (the gated integration test) |
| No bare `print` (T20) | ✅ clean |
| Shared schema / `pnpm check:codegen` | ✅ untouched (AD-8 — artefact is Minion-internal) |
| OAuth boundary | ✅ `CLAUDE_CODE_OAUTH_TOKEN` injected, `ANTHROPIC_API_KEY` stripped (constitution §2.2) |

## Acceptance criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC-1 — assemble within 500k budget, truncation logged | ✅ | `generate/assemble.py`; `test_assemble` (ok-only, ordering, truncation) |
| AC-2 — `bypassPermissions`, OAuth set, no `ANTHROPIC_API_KEY` | ✅ | `generate/runner.py`; `test_generate_runner` (argv + env assertions) |
| AC-3 — parse to `GeneratedArticle`; unparseable → retry | ✅ | `GenerateStep`; `test_generate_step` (parse, unparseable-retry) |
| AC-4 — frontmatter/length/word caps; unknown theme → `"other"` | ✅ | `validate_structure`; `test_validate_output_rules`, `test_generate_step` (theme) |
| AC-5 — quote length/count, wholesale n-gram, attribution | ✅ | `validate_copyright`; `test_copyright_validator` (all four rejections) |
| AC-6 — validation retry ≤2 with feedback; exhaustion hard-fails | ✅ | `GenerateStep` loop; `test_generate_step`, `test_generation_pipeline` |
| AC-7 — transport error backoff 2× then fail, distinct path | ✅ | `GenerateStep._invoke`; `test_generate_step`, pipeline transport test |
| AC-8 — Pydantic boundaries + runner behind port; hermetic gate | ✅ | `generate/*`; whole suite runs with no binary/plugin/network |
| AC-9 — replay overwrites artefact (idempotency) | ✅* | Inherited from F-003's `runs/{date}` overwrite; *see note 5 — the artefact isn't persisted in F-005 yet |

## Notes (non-blocking — coordination / burn-in follow-ups)

1. **The `/generate` output contract is owned externally (AD-4).** F-005 codes to a temp-file-in
   / stdout-JSON-out contract; the real `allienna/claude-feature-flow` `/generate` command must
   emit a JSON document parseable into `GeneratedArticle`. This is pinned only by the gated
   `@pytest.mark.integration` test (deselected in CI). Aligning the plugin is outside this repo —
   verify against the real plugin in F-007/burn-in. **Highest-risk item.**
2. **Copyright heuristics are approximate (AD-6/AD-7).** The 12-token wholesale run, the quote
   substring-attribution, and the references-list rule are explainable proxies, not perfect NLP —
   false positives force needless retries; tune thresholds during burn-in (F-013).
3. **Char-based token estimate (AD-10/AD-12)** (`chars/4`) is a budget guard, not Claude's real
   tokenizer; the 500k/30k caps are approximate bounds.
4. **Frontmatter fields + theme allowlist (AD-5)** are seeded constants that may drift from the
   external Astro content schema; reconcile in burn-in.
5. **AC-9 idempotency is inherited, not re-tested here.** F-005 holds the artefact in the data
   bag and does not persist it, so there is nothing new to de-duplicate; the run-document
   overwrite is guaranteed by F-003 and covered by its replay tests. Add an artefact-level replay
   test when persistence lands (F-006).

## Conclusion

All nine ACs are met with a green, hermetic quality gate. The notes are external-coordination
and burn-in tuning items, not correctness defects in this codebase. **Cleared to proceed to QA
and ship.**
