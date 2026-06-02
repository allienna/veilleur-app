# Tasks: Imagen 4 Fast + GitHub publish

**Plan**: specs/006-imagen-github-publish/plan.md
**Status**: Ready
**Total**: 18 tasks across 3 phases

Run from `minion/`. Gate every task on the constitution §5 quality bar:
`uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest`.
The named per-task `pytest` selector is the fast inner loop; the full gate is the outer one.

## Phase 1: Models, ports, config, serialization (foundation)

- [x] **T-1.1**: Add F-006 config constants
  - **Do**: In `minion/src/minion/config.py` add the `--- Publish (F-006) ---` block: Imagen (`IMAGEN_PROJECT_ID="veilleur-app"`, `IMAGEN_LOCATION="europe-west1"`, `IMAGEN_MODEL="imagen-4.0-fast-generate-001"`, `IMAGEN_BRAND_TEMPLATE` promoted from `spike.imagen.SPIKE_IMAGEN_PROMPT`, `IMAGEN_RETRIES=1` for the moderation rewrite, `IMAGEN_ASPECT_RATIO="16:9"`, `WEBP_QUALITY=85`); GitHub (`GITHUB_PAT_SECRET="github-pat-allienna-pages"`, `GITHUB_REPO_OWNER="allienna"`, `GITHUB_REPO_NAME="veilleur-app"`, `GITHUB_BRANCH="main"`, `POST_MD_PATH_TEMPLATE="site/src/content/posts/{date}-{slug}.md"`, `POST_IMAGE_PATH_TEMPLATE="site/public/images/posts/{date}.webp"`, `GITHUB_TIMEOUT=timedelta(seconds=30)`, `GITHUB_RETRIES=3`, `GITHUB_BACKOFF_BASE=timedelta(seconds=1)`); persistence (`ARTICLES_COLLECTION="articles"`); serialization (`SLUG_MAX_LEN=80`); placeholder (`PLACEHOLDER_ASSET="placeholder.webp"`). Comment each with its PRD/constitution ref.
  - **Test**: `uv run python -c "from minion import config; assert config.IMAGEN_MODEL and config.GITHUB_RETRIES==3 and config.ARTICLES_COLLECTION=='articles'"`

- [x] **T-1.2**: Publish Pydantic models
  - **Do**: Create `minion/src/minion/publish/__init__.py` and `minion/src/minion/publish/models.py` with `extra="forbid"` models: `ImageArtifact` (`filename: str`, `webp: bytes`, `placeholder: bool = False`), `CommitResult` (`path: str`, `sha: str`), and `ArticleDoc` (`date`, `slug`, `theme`, `frontmatter: ArticleFrontmatter`, `body`, `linkedin`, `image: str`, `commit_sha: str | None = None`, `published: bool = False`). Reuse `generate.models.ArticleFrontmatter`.
  - **Test**: `uv run pytest tests/test_publish_models.py` (round-trip + `extra="forbid"` rejection)

- [x] **T-1.3**: Publish ports + errors
  - **Do**: Create `minion/src/minion/publish/ports.py` with `ImagenBlockedError(RuntimeError)`, `ContentRepoError(RuntimeError)`, and Protocols: `ImageGenerator.generate(prompt: str) -> bytes` (raises `ImagenBlockedError` on moderation/empty/quota), `PromptRewriter.soften(prompt: str, reason: str) -> str`, `ContentRepository.put_file(path: str, content: bytes, message: str) -> str` (idempotent update-with-sha, returns commit SHA; raises `ContentRepoError`). Docstrings mirror `generate/ports.py`.
  - **Test**: `uv run pyright src/minion/publish/ports.py`

- [x] **T-1.4**: Dependency-free serializer (`slugify` + `render_post`)
  - **Do**: Create `minion/src/minion/publish/serialize.py`: `slugify(title) -> str` (NFKD ASCII-fold → lowercase → non-alphanumeric runs → `-` → strip `-` → cap `SLUG_MAX_LEN`), and `render_post(article: GeneratedArticle) -> str` emitting `---\n<yaml>\n---\n\n<body>` with fields ordered `REQUIRED_FRONTMATTER_FIELDS + ("image","kind")`, scalars double-quoted+escaped, `tags` as a flow sequence. Pure functions, no I/O (AD-6).
  - **Test**: `uv run pytest tests/test_serialize.py` (accents/punctuation/over-length slugs; quoting of titles with `"`/`:`; stable field order)

- [x] **T-1.5**: `ArticleStore` port + in-memory fake
  - **Do**: Add `ArticleStore` Protocol to `minion/src/minion/store/ports.py` with `put_article(date: str, article: ArticleDoc) -> None` (overwrite-by-date) and `get_article(date: str) -> ArticleDoc | None`. Add `InMemoryArticleStore` to `minion/src/minion/store/memory.py` (dict keyed by date).
  - **Test**: `uv run pytest tests/test_article_store.py` (put→get, overwrite idempotency)

- [x] **T-1.6**: `FirestoreArticleStore` adapter
  - **Do**: Add `FirestoreArticleStore` to `minion/src/minion/store/firestore.py` (`# pyright: basic` already in file) writing `articles/{date}` (set-with-merge=False for clean overwrite). Map `ArticleDoc` ↔ Firestore dict.
  - **Test**: `uv run pyright src/minion/store/firestore.py` (behavior proven by the in-memory fake per AD-3; real Firestore in F-007)

- [x] **T-1.7**: `StepResult.warning` field (AD-4 foundation)
  - **Do**: In `minion/src/minion/steps/base.py` add `warning: str | None = None` to `StepResult` with a docstring (run-level downgrade to `success_with_warnings`, latched by the orchestrator; does not halt).
  - **Test**: `uv run pyright src/minion/steps/base.py && uv run pytest tests/ -k step` (existing step tests still green)

## Phase 2: Adapters + steps (business logic)

- [x] **T-2.1**: Promote Imagen + PromptRewriter adapters
  - **Do**: Create `minion/src/minion/publish/imagen.py` with `VertexImageGenerator` (promote `spike/imagen.py`: lazy `genai.Client(vertexai=True,...)`, `generate_images`, PNG→WebP via Pillow at `WEBP_QUALITY`; raise `ImagenBlockedError` on empty/missing bytes) and `ClaudePromptRewriter` (own `claude -p` subprocess that softens a prompt given a reason). Strict-typed; uses `config`. Leave `spike/imagen.py` untouched (deleted in F-013).
  - **Test**: `uv run pyright src/minion/publish/imagen.py` (real Vertex/Claude only under the `integration` marker)

- [x] **T-2.2**: Promote GitHub content repository adapter
  - **Do**: Create `minion/src/minion/publish/github.py` with `GitHubContentRepository` implementing `put_file` (promote `spike/github.py`: GET sha → PUT with optional `sha` → return `commit.sha`; PAT via `secrets.require(config.GITHUB_PAT_SECRET)`; `httpx`). Raise `ContentRepoError` on non-2xx. No per-call retry here — retry/backoff lives in `GithubStep` (T-2.4). Leave `spike/github.py` untouched.
  - **Test**: `uv run pyright src/minion/publish/github.py`

- [x] **T-2.3**: Publish fakes
  - **Do**: Create `minion/src/minion/publish/fakes.py`: `FakeImageGenerator` (scripted list of `bytes`-or-`ImagenBlockedError` per call, records prompts), `FakePromptRewriter` (records `(prompt, reason)` calls, returns a softened string), `FakeContentRepository` (records `put_file` calls path→content; scriptable to raise `ContentRepoError` N times then succeed; returns deterministic SHAs).
  - **Test**: `uv run pyright src/minion/publish/fakes.py`

- [x] **T-2.4**: `ImagenStep` (FR-1/FR-2) with moderation fallback + warning
  - **Do**: Create `minion/src/minion/steps/publish.py` (this task adds `ImagenStep` only). Reads `GeneratedArticle` from the bag; builds the final prompt (`image_prompt` + `IMAGEN_BRAND_TEMPLATE`); calls `ImageGenerator.generate`. On `ImagenBlockedError`: one `PromptRewriter.soften` retry; on a second failure, load the bundled placeholder via `importlib.resources` and return `StepResult(warning="imagen_moderation_fallback", ...)`. Writes `ImageArtifact` to the bag and back-fills `frontmatter.image = filename` on the article. Inject `image_generator`, `prompt_rewriter`.
  - **Test**: `uv run pytest tests/test_imagen_step.py` (happy WebP + back-fill; reject→rewrite→ok; reject→rewrite→reject→placeholder+warning)

- [x] **T-2.5**: Bundle placeholder asset
  - **Do**: Add `minion/src/minion/publish/assets/placeholder.webp` (generic Le Veilleur 16:9 WebP) and ensure it ships in the wheel (`[tool.hatch.build]` package-data / it lives under `src/minion`). Loader in `ImagenStep` uses `importlib.resources.files("minion.publish.assets")`.
  - **Test**: `uv run pytest tests/test_imagen_step.py -k placeholder` (asset loads as non-empty WebP bytes)

- [x] **T-2.6**: `GithubStep` (FR-3/FR-4/FR-6) persist-before-commit + retry
  - **Do**: In `steps/publish.py` add `GithubStep` (inject `content_repo`, `article_store`). First persist the recoverable `ArticleDoc` (no `commit_sha`, `published=False`) via `article_store.put_article` (FR-6/AD-5). Then `slugify` + `render_post`, and commit md + image to the two `config` path templates with **3× exponential backoff** on `ContentRepoError`; exhausting retries raises (hard fail, artefact already durable). Put both `CommitResult`s (and the md commit SHA) in the bag.
  - **Test**: `uv run pytest tests/test_github_step.py` (two-file commit + SHAs; replay overwrites; 3× retry-then-fail with article persisted beforehand; missing PAT → hard fail)

- [x] **T-2.7**: `PublishStep` (FR-5) reader-doc upsert + web-push stub
  - **Do**: In `steps/publish.py` add `PublishStep` (inject `article_store`). Upsert the final `ArticleDoc` (now with `commit_sha` from the bag, `published=True`) idempotently by date. Log a `web push deferred (F-012)` line as the explicit stub for step 9's notification half.
  - **Test**: `uv run pytest tests/test_publish_step.py` (idempotent upsert by date; commit SHA + `published=True` recorded; no push sent)

## Phase 3: Wiring + orchestrator + end-to-end (integration)

- [x] **T-3.1**: Orchestrator `success_with_warnings` propagation (AD-4)
  - **Do**: In `minion/src/minion/orchestrator.py` track `warning_reason: str | None`; after a step succeeds, if `result.warning` is set and `warning_reason` is unset, latch it (first wins) — do not halt. At finalize: if `status is RunStatus.success` and `warning_reason` is set, finalize `RunStatus.success_with_warnings` with the reason in `Run.error`. Ensure `failure` and `terminal_status` take precedence.
  - **Test**: `uv run pytest tests/test_warning_propagation.py` (warning→`success_with_warnings`; warning never overrides `failure` or a `terminal_status` skip; no warning→`success`)

- [x] **T-3.2**: Wire the real steps into `build_pipeline` + drop stubs
  - **Do**: In `minion/src/minion/steps/__init__.py` extend `build_pipeline` with `image_generator`, `prompt_rewriter`, `content_repo`, `article_store`; map `StepName.imagen/github/publish` to the real steps. Remove the `imagen`/`github`/`publish` entries from `steps/stubs.py:_CANNED_PAYLOADS` (no remaining stub steps).
  - **Test**: `uv run pytest tests/ -k pipeline` (build_pipeline returns all-real steps in `STEP_ORDER`)

- [x] **T-3.3**: CLI composition root
  - **Do**: In `minion/src/minion/cli.py` extend `build_stores` to also return a `FirestoreArticleStore`, and `build_clients` to construct `VertexImageGenerator`, `ClaudePromptRewriter`, `GitHubContentRepository` (lazy imports, like the existing adapters); pass all into `build_pipeline`. Keep imports lazy so `python -m minion` imports without GCP creds.
  - **Test**: `uv run pytest tests/test_cli.py` (CLI imports + arg parsing without credentials)

- [x] **T-3.4**: Full fake end-to-end run (AC-8)
  - **Do**: Add `minion/tests/test_publish_integration.py` with (a) an in-CI fake end-to-end test driving `run_pipeline` with all fakes (`gmail`→…→`publish`) asserting an `ArticleDoc` in the `InMemoryArticleStore`, both commits in `FakeContentRepository`, and an `ImageArtifact` in the bag; and (b) a `@pytest.mark.integration` real-Vertex+GitHub smoke (excluded by `addopts = -m 'not integration'`).
  - **Test**: `uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest` (full constitution §5 gate green)
