# Tasks: Agentic step `/generate` (the talk artefact)

**Plan**: specs/005-agentic-generate/plan.md
**Status**: Done
**Total**: 17 tasks across 3 phases

All commands run from `minion/`. Each task's **Test** is the minimal check; the final task runs
the full gate (`uv run ruff check . && uv run ruff format --check . && uv run pyright &&
uv run pytest`). The default `pytest` excludes `@pytest.mark.integration` (AD-11).

## Phase 1: Contracts, config, and pure validators

- [x] **T-1.1**: Artefact models
  - **Do**: Create `minion/src/minion/generate/__init__.py` and
    `minion/src/minion/generate/models.py` with `ContextSource` (url, title, markdown),
    `AssembledContext` (sources list), `ArticleFrontmatter` (title, date, description, tags,
    image, kind), `GeneratedArticle` (theme, frontmatter, body, linkedin, image_prompt),
    `ValidationError` (code, message), `ValidationReport` (errors list + `ok` property). All
    `model_config = ConfigDict(extra="forbid")`.
  - **Test**: `uv run pyright`.

- [x] **T-1.2**: Config constants for generation
  - **Do**: In `minion/src/minion/config.py` add `ANTHROPIC_OAUTH_TOKEN_SECRET`,
    `MAX_GENERATE_INPUT_TOKENS=500_000`, `MAX_GENERATE_OUTPUT_TOKENS=30_000`,
    `MAX_ARTICLE_WORDS=10_000`, `MAX_LINKEDIN_CHARS=3000`, `MAX_IMAGE_PROMPT_CHARS=1000`,
    `REQUIRED_FRONTMATTER_FIELDS`, `THEME_ALLOWLIST`, `DEFAULT_THEME="other"`,
    `WHOLESALE_NGRAM=12`, `MAX_QUOTE_WORDS=30`, `MAX_QUOTES_PER_SOURCE=1`,
    `MAX_GENERATE_RETRIES=2`, and Claude cmd/timeout/backoff constants. Seed frontmatter
    fields + theme allowlist from the Astro repo with a source-of-truth comment (AD-5).
  - **Test**: `uv run python -c "from minion import config; assert config.MAX_GENERATE_RETRIES == 2"`.

- [x] **T-1.3**: `GenerateRunner` port + transport error
  - **Do**: Create `minion/src/minion/generate/ports.py` with `GenerateTransportError` and the
    `GenerateRunner` Protocol: `invoke(context: AssembledContext, feedback: list[str]) -> str`.
  - **Test**: `uv run pyright`.

- [x] **T-1.4**: Token-estimate helper + structural validators
  - **Do**: Create `minion/src/minion/generate/validate.py` with `estimate_tokens(text) -> int`
    (`ceil(chars/4)`, AD-10) and `validate_structure(article) -> list[ValidationError]`
    enforcing required frontmatter fields, LinkedIn ≤3000, image prompt ≤1000, article ≤10k
    words, and the 30k output-token post-hoc guard. (Theme normalization lives in the step, not
    here.) Add `tests/test_validate_output_rules.py`.
  - **Test**: `uv run pytest tests/test_validate_output_rules.py`.

- [x] **T-1.5**: Copyright validator
  - **Do**: Add `validate_copyright(article, sources) -> list[ValidationError]` to
    `validate.py`: quotes ≤30 words and ≤1 per source; wholesale check = ≥`WHOLESALE_NGRAM`
    consecutive normalized tokens shared between an article paragraph and any source paragraph
    (AD-6); references-list attribution rule (AD-7); assert no paywalled content. Add a
    `validate_article(article, sources) -> ValidationReport` combiner. Add
    `tests/test_copyright_validator.py`.
  - **Test**: `uv run pytest tests/test_copyright_validator.py`.

- [x] **T-1.6**: Fake runner
  - **Do**: Create `minion/src/minion/generate/fakes.py` with `FakeGenerateRunner` — returns a
    scripted sequence of raw outputs per attempt (or raises `GenerateTransportError`), and
    records the `feedback` passed on each invocation.
  - **Test**: `uv run pyright`.

## Phase 2: Real runner + context assembly

- [x] **T-2.1**: Context assembly
  - **Do**: Create `minion/src/minion/generate/assemble.py` with
    `assemble_context(source_set) -> AssembledContext`: select OK sources, preserve order, drop
    lowest-priority (trailing) sources until the estimated token count fits
    `MAX_GENERATE_INPUT_TOKENS`, logging truncation. Add `tests/test_assemble.py` (ok-only
    selection, ordering, budget truncation).
  - **Test**: `uv run pytest tests/test_assemble.py`.

- [x] **T-2.2**: Real Claude runner
  - **Do**: Create `minion/src/minion/generate/runner.py` (`# pyright: basic`) —
    `ClaudeGenerateRunner.invoke` builds `claude -p "/generate" --permission-mode
    bypassPermissions`, spawns it with the OAuth env (`CLAUDE_CODE_OAUTH_TOKEN` from
    `secrets.require(...)`, `ANTHROPIC_API_KEY` removed), writes context (+feedback) to a temp
    JSON file, returns stdout; maps FileNotFound/Timeout/non-zero → `GenerateTransportError`
    (AD-2/AD-4/AD-9). Add `tests/test_generate_runner.py` with `subprocess.run` monkeypatched.
  - **Test**: `uv run pytest tests/test_generate_runner.py`.

- [x] **T-2.3**: Runner auth + transport assertions
  - **Do**: Extend `tests/test_generate_runner.py`: assert argv carries
    `--permission-mode bypassPermissions`, the env has `CLAUDE_CODE_OAUTH_TOKEN` and **no**
    `ANTHROPIC_API_KEY`, feedback is forwarded into the context file, and each of
    FileNotFound / TimeoutExpired / non-zero exit raises `GenerateTransportError`.
  - **Test**: `uv run pytest tests/test_generate_runner.py`.

## Phase 3: Steps, retry loop, wiring, end-to-end

- [x] **T-3.1**: `AssembleStep`
  - **Do**: Create `minion/src/minion/steps/generation.py` with `AssembleStep`
    (`name=StepName.assemble`): read `sources: SourceSet` from the bag, call `assemble_context`,
    write `AssembledContext` to the bag. Add `tests/test_generate_step.py` covering AssembleStep.
  - **Test**: `uv run pytest tests/test_generate_step.py`.

- [x] **T-3.2**: `GenerateStep` — invoke + parse + theme normalization
  - **Do**: Add `GenerateStep` (`name=StepName.generate`, holds a `GenerateRunner`): invoke the
    runner with the assembled context, parse stdout JSON into `GeneratedArticle` (parse failure =
    a validation error, not transport), normalize an unknown `theme` to `DEFAULT_THEME`, with
    transport-retry (2× backoff) around the runner call (AC-7). Extend
    `tests/test_generate_step.py` (parse, theme default, transport retry → fail).
  - **Test**: `uv run pytest tests/test_generate_step.py`.

- [x] **T-3.3**: `GenerateStep` — the agentic validation-retry loop
  - **Do**: Wrap invoke+parse+`validate_article` in a loop up to `MAX_GENERATE_RETRIES`: on a
    validation failure re-invoke with the errors fed back; on success store `GeneratedArticle` +
    `ValidationReport` in the bag; on exhaustion raise `GenerationFailedError` (run failure) with
    accumulated errors (AD-3, AC-6). Extend `tests/test_generate_step.py`
    (invalid-then-valid → one retry with feedback forwarded; 3× invalid → raise).
  - **Test**: `uv run pytest tests/test_generate_step.py`.

- [x] **T-3.4**: `ValidateOutputStep` (gate of record)
  - **Do**: Add `ValidateOutputStep` (`name=StepName.validate_output`): read the stored
    `ValidationReport`, pass on `report.ok`, fail closed (raise) otherwise; observable record of
    constitutional §4 enforcement (AD-3). Extend `tests/test_generate_step.py`.
  - **Test**: `uv run pytest tests/test_generate_step.py`.

- [x] **T-3.5**: Pipeline factory + CLI wiring
  - **Do**: Extend `build_pipeline(gmail_client, jina_client, generate_runner)` in
    `steps/__init__.py` to wire real `assemble`/`generate`/`validate_output` (+ existing real
    ingestion + the three remaining stubs). Update `cli.build_clients` to construct
    `ClaudeGenerateRunner` and pass it through. Update `tests/test_steps.py` (real steps in
    those three slots; stub assertions target `imagen`/`github`/`publish`) and `tests/test_cli.py`
    (wired run supplies a `FakeGenerateRunner`).
  - **Test**: `uv run pytest tests/test_steps.py tests/test_cli.py`.

- [x] **T-3.6**: `pyproject` integration-marker gating
  - **Do**: In `minion/pyproject.toml` register the `integration` marker and set
    `[tool.pytest.ini_options] addopts = "-m 'not integration'"` so CI/default runs exclude it
    (AD-11).
  - **Test**: `uv run pytest --collect-only -q` (integration tests deselected by default).

- [x] **T-3.7**: End-to-end generation pipeline tests
  - **Do**: Create `tests/test_generation_pipeline.py` running `run_pipeline` with fakes +
    in-memory stores: happy path (success, 9 steps), validation-retry-then-pass, retry-exhausted
    → `failure`, transport-error → `failure`, theme-default passes, copyright-reject →
    retry/fail.
  - **Test**: `uv run pytest tests/test_generation_pipeline.py`.

- [x] **T-3.8**: Gated real-runner integration test
  - **Do**: Add one `@pytest.mark.integration` test that runs `ClaudeGenerateRunner` against the
    real plugin (skipped by default; documents the AD-4 contract). Guard so it skips cleanly when
    the `claude` binary / OAuth token is absent.
  - **Test**: `uv run pytest -m integration --collect-only` (collects; not run by default).

- [x] **T-3.9**: Full gate
  - **Do**: Resolve any lint/format/type findings; ensure no bare `print` (T20), all boundaries
    Pydantic, OAuth-only env path intact.
  - **Test**: `uv run ruff check . && uv run ruff format --check . && uv run pyright &&
    uv run pytest`.
