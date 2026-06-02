# Plan: Agentic step `/generate` (the talk artefact)

**Spec**: specs/005-agentic-generate/spec.md

This plan resolves the spec's ten Open Questions as Architecture Decisions and reuses the
F-004 patterns: a `generate/` subpackage mirroring `ingest/` (ports + fakes + models + pure
helpers), constants in `config.py`, the promoted `secrets.py`, and the data-bag step contract.
The single agentic call is wrapped behind an injected `GenerateRunner` port so the whole
pipeline tests hermetically — no `claude` binary, plugin, or network in CI.

## Architecture Decisions

### AD-1: `generate/` subpackage mirroring `ingest/`
- **Choice**: New `minion/src/minion/generate/` with `models.py` (artefact models),
  `ports.py` (`GenerateRunner` Protocol), `runner.py` (real subprocess runner), `fakes.py`
  (`FakeGenerateRunner`), `validate.py` (pure structural + copyright validators), and
  `assemble.py` (pure context assembly + token estimate). The three real steps live in
  `steps/generation.py`.
- **Rationale**: Identical shape to F-004's `ingest/` — proven, testable, keeps the
  orchestrator unaware of the subprocess.
- **Alternatives**: Inline everything in `steps/generation.py` — rejected; the validators and
  runner deserve isolated unit tests.

### AD-2: `GenerateRunner` port + real subprocess runner (promote the spike pattern)
- **Choice**: `GenerateRunner.invoke(context: AssembledContext, feedback: list[str]) -> str`
  returns the raw artefact text and raises `GenerateTransportError` on binary-missing / timeout
  / non-zero exit. `ClaudeGenerateRunner` (real) builds `claude -p "/generate"
  --permission-mode bypassPermissions`, spawns it with the OAuth env (FR-7), and is marked
  `# pyright: basic` (subprocess/SDK boundary, like `store/firestore.py`). `FakeGenerateRunner`
  returns scripted outputs per attempt for tests.
- **Rationale**: Promotes the F-001 `spike/claude_probe.py` invocation to production behind a
  port; mirrors F-004's `GmailClient`/`JinaClient`.
- **Alternatives**: Call `subprocess.run` directly in the step — rejected (untestable without
  the binary).

### AD-3: The agentic retry loop lives in the `generate` step; `validate_output` is the gate of record
- **Choice**: `generate` step owns the loop — invoke → parse → validate (the pure validators)
  → on failure re-invoke with the errors fed back, up to `MAX_GENERATE_RETRIES = 2`; it stores
  the **validated** `GeneratedArticle` *and* its `ValidationReport` in the data bag, or raises
  `GenerationFailedError` (run failure) when retries are exhausted. `validate_output` step then
  reads the stored `ValidationReport` and is the **observable deterministic gate of record**
  (constitution §2.9 + §4): it passes on `report.ok`, and fails closed otherwise.
- **Rationale**: FR-6's "generate + validate_output form a loop" cannot span two steps in the
  linear state machine. Encapsulating the loop in `generate` (which owns the runner + feedback)
  keeps both steps observable, reuses the pure validators, and makes `validate_output` the
  constitutional enforcement record. Re-reading a stored report is cheap and defensive.
- **Alternatives**: Loop inside `validate_output` re-invoking the runner — rejected (puts the
  runner + assembled-context dependency on the validation step and splits transport-retry logic).

### AD-4: `/generate` I/O contract — context in via temp file, artefact out as stdout JSON (OQ1)
- **Choice**: `ClaudeGenerateRunner` writes the assembled context (+ any feedback) to a
  temp JSON file, passes its path to the command, and parses a **single JSON document on
  stdout** into `GeneratedArticle`. The exact prompt wiring is the runner's private detail; the
  step only sees `AssembledContext` in and raw text out.
- **Rationale**: A file avoids arg/stdin size limits at 500k tokens; stdout JSON is trivial to
  parse and to fake. This is the **contract the external plugin's `/generate` must honour** —
  documented here and pinned by the gated integration test (AD-11).
- **Alternatives**: Command writes artefact files to a known dir — rejected (more filesystem
  coordination, harder to mock); stdin for context — rejected (size/encoding fragility).

### AD-5: Frontmatter fields + theme allowlist as `config.py` constants seeded from the Astro schema (OQ2/OQ3)
- **Choice**: `REQUIRED_FRONTMATTER_FIELDS: tuple[str, ...]` and `THEME_ALLOWLIST:
  frozenset[str]` in `config.py`, seeded from the external `allienna/veilleur` content-collection
  config (with a comment pointing there as the source of truth). An unknown theme is **normalized
  to `"other"`** in the `generate` step (not a validation error — PRD §6).
- **Rationale**: Keeps the values version-controlled and testable here; the comment + a
  burn-in reconciliation note manage drift against the external repo.
- **Alternatives**: Fetch the schema from the Astro repo at runtime — rejected (network coupling,
  no benefit for a pinned product).

### AD-6: Wholesale-reproduction check = consecutive-token shingle overlap (OQ4)
- **Choice**: `validate_copyright` flags a violation when any article paragraph shares a run of
  **≥ `WHOLESALE_NGRAM = 12` consecutive normalized tokens** with any source paragraph
  (lowercased, punctuation-stripped, whitespace-collapsed). Threshold in `config.py`.
- **Rationale**: Consecutive-run overlap is a defensible, deterministic, explainable proxy for
  "reproduced wholesale," cheap to compute, and tunable.
- **Alternatives**: Shingle-Jaccard ratio — rejected as less explainable; full diff — overkill.

### AD-7: Attribution rule = every used source appears in a references list with a resolving link (OQ5)
- **Choice**: `validate_copyright` requires that, for each source whose name/domain appears in the
  article body, a references/"Sources" section lists that source **by name with a link that
  resolves to one of the provided source URLs**. Detecting arbitrary "facts" is out of scope; this
  references-list rule is the tractable deterministic approximation.
- **Rationale**: Deterministic, checkable, and matches how the article will read on the Astro
  site; honours FR-A3 intent without an impossible NLP task.
- **Alternatives**: Per-sentence citation detection — rejected (not deterministically tractable).

### AD-8: `GeneratedArticle` stays Minion-internal; no shared schema (OQ6)
- **Choice**: `GeneratedArticle` and friends are Pydantic models in `generate/models.py`, carried
  in the data bag. No `shared/schema` change; `pnpm check:codegen` stays untouched.
- **Rationale**: The artefact isn't persisted by F-005; the cross-boundary `article.json` belongs
  with the persistence/PWA-reading feature (F-006/F-009).
- **Alternatives**: Define `article.json` now — deferred; no consumer yet.

### AD-9: Retry feedback forwarded through the runner (OQ7)
- **Choice**: Validation errors are passed to `GenerateRunner.invoke(..., feedback: list[str])`;
  the real runner serializes them into the re-invocation's context file as a "previous attempt
  failed these checks — fix them" section. The fake asserts feedback is forwarded.
- **Rationale**: Keeps the feedback mechanism behind the port; the step stays transport-agnostic.

### AD-10: `assemble` owned by F-005; budget via a char-based token estimate (OQ8)
- **Choice**: `assemble.py` builds `AssembledContext` from the validated OK `SourceSet`, ordered
  by source position, dropping lowest-priority (last) sources until the estimated token count
  fits `MAX_GENERATE_INPUT_TOKENS = 500_000`; truncation is logged. Token estimate is a
  deterministic heuristic (`ceil(chars / 4)`) — no tokenizer dependency.
- **Rationale**: `assemble` is the `/generate` input prep and currently a stub; nothing else owns
  it. A char heuristic is sufficient for a budget guard and adds no dependency.
- **Alternatives**: A real tokenizer (`tiktoken`) — rejected (wrong tokenizer for Claude, new dep,
  unnecessary precision for a cap).

### AD-11: Gated integration test; everything else mocks the runner (OQ9)
- **Choice**: Real-`claude` coverage lives in one test marked `@pytest.mark.integration`,
  deselected by default (`addopts = "-m 'not integration'"` in `pyproject`). Unit + pipeline
  tests use `FakeGenerateRunner`. CI (`build-minion`) runs only the default (non-integration) set.
- **Rationale**: Keeps CI hermetic and fast while preserving a way to exercise the real plugin.

### AD-12: Output caps enforced post-hoc (OQ10)
- **Choice**: Article ≤ 10k words, LinkedIn ≤ 3000 chars, image prompt ≤ 1000 chars are
  structural validations (FR-4); the 30k **output**-token cap is a post-hoc guard on the raw
  artefact via the same char heuristic (`MAX_GENERATE_OUTPUT_TOKENS`).
- **Rationale**: Deterministic, no dependency, fails into the retry loop like any other validation.

### AD-13: Pipeline wiring extends `build_pipeline` with the runner
- **Choice**: `build_pipeline(gmail_client, jina_client, generate_runner)` wires real
  `assemble` / `generate` / `validate_output` plus the existing real ingestion steps and the three
  remaining stubs (`imagen`, `github`, `publish`). `cli.build_clients` constructs
  `ClaudeGenerateRunner`.
- **Rationale**: One composition root; matches F-004's factory.

## Affected Files

### New Files
| File | Purpose |
|------|---------|
| `minion/src/minion/generate/__init__.py` | Subpackage exports. |
| `minion/src/minion/generate/models.py` | `ContextSource`, `AssembledContext`, `ArticleFrontmatter`, `GeneratedArticle`, `ValidationError`, `ValidationReport`. |
| `minion/src/minion/generate/ports.py` | `GenerateRunner` Protocol + `GenerateTransportError`. |
| `minion/src/minion/generate/runner.py` | `ClaudeGenerateRunner` — subprocess + OAuth env + temp-file/stdout-JSON contract (`# pyright: basic`). |
| `minion/src/minion/generate/validate.py` | Pure `validate_structure`, `validate_copyright`, `validate_article` + token-estimate helper. |
| `minion/src/minion/generate/assemble.py` | Pure `assemble_context` (select/order/budget the sources). |
| `minion/src/minion/generate/fakes.py` | `FakeGenerateRunner` (scripted per-attempt outputs, feedback capture). |
| `minion/src/minion/steps/generation.py` | `AssembleStep`, `GenerateStep` (the loop), `ValidateOutputStep` (gate of record). |
| `minion/tests/test_assemble.py` | Ordering, budget truncation, ok-only selection. |
| `minion/tests/test_validate_output_rules.py` | Frontmatter/length/word/theme-normalization rules. |
| `minion/tests/test_copyright_validator.py` | Quote length/count, wholesale n-gram, attribution. |
| `minion/tests/test_generate_runner.py` | Mocked `subprocess.run`: command, OAuth env (no `ANTHROPIC_API_KEY`), stdout parse, transport errors. |
| `minion/tests/test_generate_step.py` | The retry loop over `FakeGenerateRunner` (first-fail-then-pass, exhaustion, transport retry, theme default). |
| `minion/tests/test_generation_pipeline.py` | End-to-end through `run_pipeline` with fakes. |

### Modified Files
| File | Change |
|------|--------|
| `minion/src/minion/config.py` | Add caps (`MAX_GENERATE_INPUT_TOKENS`, `MAX_GENERATE_OUTPUT_TOKENS`, `MAX_ARTICLE_WORDS`, `MAX_LINKEDIN_CHARS`, `MAX_IMAGE_PROMPT_CHARS`), `REQUIRED_FRONTMATTER_FIELDS`, `THEME_ALLOWLIST`, `DEFAULT_THEME="other"`, `WHOLESALE_NGRAM`, `MAX_QUOTE_WORDS=30`, `MAX_QUOTES_PER_SOURCE=1`, `MAX_GENERATE_RETRIES=2`, `CLAUDE_*` cmd/timeout/backoff, `ANTHROPIC_OAUTH_TOKEN_SECRET`. |
| `minion/src/minion/steps/__init__.py` | `build_pipeline` gains `generate_runner`; wire the three real steps. |
| `minion/src/minion/cli.py` | `build_clients` constructs `ClaudeGenerateRunner`; pass to `build_pipeline`. |
| `minion/pyproject.toml` | `[tool.pytest.ini_options] addopts = "-m 'not integration'"` + register the `integration` marker. |
| `minion/tests/test_steps.py` | `build_pipeline` now wires real assemble/generate/validate_output; update stub-shape assertions to the three remaining stubs. |
| `minion/tests/test_cli.py` | Wired run provides a `FakeGenerateRunner` via `build_clients`. |

## Implementation Phases

### Phase 1: Contracts, config, pure validators (foundation)
- `generate/models.py`, `generate/ports.py`, `generate/fakes.py`.
- `config.py` constants (caps, frontmatter fields, theme allowlist, thresholds, retry, claude cmd).
- `generate/validate.py` (`validate_structure`, `validate_copyright`, `validate_article`,
  `estimate_tokens`) + `test_validate_output_rules.py` + `test_copyright_validator.py`.

### Phase 2: Real runner + context assembly
- `generate/assemble.py` (`assemble_context`) + `test_assemble.py`.
- `generate/runner.py` (`ClaudeGenerateRunner`: OAuth env from `secrets`, temp-file/stdout-JSON,
  transport errors, feedback) + `test_generate_runner.py` with `subprocess.run` monkeypatched.

### Phase 3: Steps, retry loop, wiring, end-to-end
- `steps/generation.py`: `AssembleStep`, `GenerateStep` (invoke→parse→validate→retry≤2, theme
  normalization, stores article + report), `ValidateOutputStep` (gate of record).
- `steps/__init__.py` `build_pipeline` + `cli.py` wiring; `pyproject` marker/addopts.
- `test_generate_step.py` (loop scenarios), `test_generation_pipeline.py` (happy /
  validation-retry-then-pass / retry-exhausted-fail / transport-retry / theme-default /
  copyright-reject), update `test_steps.py` + `test_cli.py`.
- Gated `@pytest.mark.integration` real-runner test (skipped in CI).
- Final gate: `uv run ruff check . && uv run ruff format --check . && uv run pyright &&
  uv run pytest`.

## Test Strategy
- **Mocking approach**: `FakeGenerateRunner` (the F-004 ports+fakes pattern) for step/pipeline
  tests — scripted to return a valid artefact, or an invalid-then-valid sequence, or to raise
  `GenerateTransportError`. `ClaudeGenerateRunner` unit-tested with `subprocess.run` monkeypatched
  (assert argv, assert `CLAUDE_CODE_OAUTH_TOKEN` set and `ANTHROPIC_API_KEY` absent in env, parse
  stdout JSON, map FileNotFound/Timeout/non-zero to `GenerateTransportError`). Pure validators
  tested directly. **No `claude` binary / plugin / network in the default suite.**
- **Happy paths**: assemble selects ok sources within budget; generate produces a parseable,
  valid article in one attempt; validate_output passes; downstream stubs run; run `success`.
- **Error scenarios**: invalid-then-valid → one retry with feedback forwarded → success;
  validation fails 3× → run `failure` with accumulated errors; transport error → 2 backoff
  retries → `failure`; missing OAuth secret → `failure` before invocation.
- **Edge cases**: unknown theme → normalized to `"other"` (passes); over-budget source set →
  truncation logged; >30-word quote / 2nd quote per source / ≥12-token wholesale run / missing
  attribution each rejected; article >10k words / LinkedIn >3000 / image prompt >1000 rejected;
  replay overwrites the prior artefact (idempotency).

## Risk & Complexity
- **Estimated complexity**: **High** — an external-process integration with a two-tier retry
  model (transport vs validation), a deterministic copyright validator, and a contract owned by
  an external repo.
- **Key risks**:
  - *The `/generate` output contract is owned by the external `allienna/claude-feature-flow`
    plugin* (AD-4). F-005 codes to an agreed JSON shape; if the plugin emits otherwise, the real
    run breaks. Mitigation: the contract is pinned here and exercised only by the gated
    integration test; aligning the plugin is out of this repo's control — flag for F-007/burn-in.
  - *Copyright + attribution heuristics* (AD-6/AD-7) are approximate — false positives force
    needless retries, false negatives risk unsafe output. Tunable thresholds; revisit in burn-in
    (F-013).
  - *Frontmatter fields + theme allowlist drift* against the external Astro repo (AD-5).
  - *Char-based token estimate* (AD-10/AD-12) is approximate vs Claude's real tokenizer — a
    budget guard, not an exact bound.
  - *Two retry semantics* must stay distinct (AC-7 vs AC-6).
- **New dependencies**: none — `subprocess`, `json`, `tempfile`, `re` are stdlib; no tokenizer
  added (heuristic by design).
