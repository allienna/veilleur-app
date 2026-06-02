# Plan: Imagen 4 Fast + GitHub publish

**Spec**: specs/006-imagen-github-publish/spec.md

This plan resolves the spec's Open Questions (user decisions on #1–#3; recommendations adopted for
#4–#8) and turns the three stub steps (`imagen`, `github`, `publish`) into production code,
promoting the F-001 spike modules behind injected ports — the same ports+fakes shape F-004/F-005
established.

## Resolved Open Questions

| # | Question | Resolution |
|---|----------|-----------|
| 1 | F-006 owns Firestore article persistence? | **Yes** (user). F-006 implements the Firestore-persist half of `publish`; web-push stays stubbed for F-012. Persisted doc kept Minion-internal (not promoted to `shared/` yet — AD-7). |
| 2 | Target GitHub repo / paths | **`allienna/veilleur-app` @ `main`** (user; migration override, matches the spike). Paths per FR-A4: `site/src/content/posts/{date}-{slug}.md` + `site/public/images/posts/{date}.webp`. Repo is a one-constant switch to `allienna/veilleur` later. |
| 3 | Imagen prompt-rewrite mechanism | **Dedicated `PromptRewriter` port** (user) — own `claude -p` adapter + fake, decoupled from F-005's `GenerateRunner`. |
| 4 | `success_with_warnings` shape | Add `warning: str \| None` to `StepResult`; orchestrator latches it. Precedence: `failure` > `terminal_status` > `success_with_warnings` > `success` (AD-4). |
| 5 | Slug derivation | Deterministic: NFKD ASCII-fold → lowercase → non-alphanumeric runs to `-` → strip → cap `SLUG_MAX_LEN=80` (AD-6). |
| 6 | Astro frontmatter field set | Reuse F-005 `REQUIRED_FRONTMATTER_FIELDS` = `("title","date","description","tags")` + `image` + `kind`; reconcile against the real Astro schema in burn-in (F-013), same pin as F-005 AD-5. |
| 7 | Placeholder image | **Committed static WebP asset** (`publish/assets/placeholder.webp`), loaded via `importlib.resources` — fully deterministic. |
| 8 | WebP / YAML deps | `pillow` is **already** a production dep (no new dep). Frontmatter uses a small **dependency-free** YAML emitter (`publish/serialize.py`), avoiding a `pyyaml` review. |

## Architecture Decisions

### AD-1: A `publish/` subpackage mirroring `ingest/` and `generate/`
- **Choice**: New `minion/src/minion/publish/` holding `models.py`, `ports.py`, real adapters (`imagen.py`, `github.py`), `serialize.py`, and `fakes.py`. The three step classes live in `steps/publish.py` (alongside `steps/ingestion.py`, `steps/generation.py`).
- **Rationale**: Exactly the structure F-004 (`ingest/`) and F-005 (`generate/`) use — steps depend on Protocols; production adapters and hermetic fakes sit behind them; CI runs green with no network.
- **Alternatives**: flat modules under `minion/` (rejected — breaks the established subpackage symmetry).

### AD-2: Three injected ports — `ImageGenerator`, `PromptRewriter`, `ContentRepository`
- **Choice**: `ImageGenerator.generate(prompt) -> bytes` (raises `ImagenBlockedError` on moderation/empty/quota), `PromptRewriter.soften(prompt, reason) -> str` (its own `claude -p` call), `ContentRepository.put_file(path, content, message) -> str` (idempotent update-with-sha, returns commit SHA; raises `ContentRepoError` on non-2xx after retries). Real adapters promoted from `spike/imagen.py` + `spike/github.py`; fakes in `publish/fakes.py`.
- **Rationale**: Matches `GenerateRunner`/`GmailClient`/`JinaClient`. Keeps Vertex + GitHub + Claude out of CI; the moderation fallback and 3×-retry logic are tested against scripted fakes.
- **Alternatives**: reuse `GenerateRunner` for the rewrite (rejected per Open Q#3 — overloads a port built for the article contract).

### AD-3: New `ArticleStore` store port (`articles/{date}`)
- **Choice**: Add `ArticleStore` to `store/ports.py` with `put_article(date, ArticleDoc)` (overwrite-by-date, idempotent), backed by `FirestoreArticleStore` (`store/firestore.py`) and `InMemoryArticleStore` (`store/memory.py`). Firestore layout: top-level `articles/{date}` collection (sibling of `runs/`).
- **Rationale**: Reuses the proven store-port + in-memory-fake pattern (AD-3 of F-003). PWA (F-009) reads `articles/{date}`; keeping it a distinct collection from `runs/` separates reader data from run-lifecycle data.
- **Alternatives**: nest the article under `runs/{date}` (rejected — couples reader queries to run docs); reuse `RunStore` (rejected — different document shape and lifecycle).

### AD-4: `success_with_warnings` via a latched `StepResult.warning`
- **Choice**: `StepResult` gains `warning: str | None = None`. The orchestrator keeps `warning_reason: str | None`; after a step succeeds, if `result.warning` is set it records the reason (first wins) but does **not** halt. At finalize: if `status is success` and `warning_reason` is set, finalize `success_with_warnings` with the reason in `Run.error` (informational). A `failure` (raise) or a `terminal_status` halt both take precedence (they `break` before/over the downgrade).
- **Rationale**: Smallest change that wires the already-existing schema token; preserves the "continue the pipeline" semantics the Imagen fallback needs. The per-step Firestore record stays `success` (the warning is run-level, PRD §6).
- **Alternatives**: a warnings list on `StepContext.data` (rejected — leaks through the data bag, not the result contract); a new step-level status (rejected — schema churn, PWA impact).

### AD-5: Persist-before-commit to guarantee no data loss (FR-6)
- **Choice**: Keep the schema-pinned `STEP_ORDER` (`imagen`→`github`→`publish`; reordering would change the `StepName` enum and the PWA timeline). The **`github` step persists the recoverable artefact** (frontmatter, body, linkedin, theme, image bytes ref) to `ArticleStore` as its *first* action, then attempts the commit (3× backoff). So even when the commit retries are exhausted and the step hard-fails, the artefact is already durable for replay. The `publish` step then writes/updates the reader-facing doc with the commit SHA and `published: true`, and leaves web-push a stub.
- **Rationale**: Honors FR-6 / PRD §4 ("artefacts persisted even when GitHub push fails, enabling manual recovery") *without* re-ordering the canonical pipeline or re-running the costly `/generate` on replay. Persistence is idempotent, so the `publish` re-write of the same `articles/{date}` doc is safe.
- **Alternatives**: reorder so `publish` precedes `github` (rejected — `StepName` enum is the shared schema, breaks F-003/F-011 contracts); persist only in `publish` (rejected — a `github` hard-fail would lose the artefact, forcing a full re-generate on replay).

### AD-6: Dependency-free deterministic markdown serialization
- **Choice**: `publish/serialize.py` exposes `slugify(title) -> str` (AD per Open Q#5) and `render_post(article) -> str` emitting `---\n<yaml>\n---\n\n<body>`. The YAML emitter double-quotes scalar strings (escaping `"`/`\`), emits `tags` as a flow sequence `["a", "b"]`, and orders fields by `REQUIRED_FRONTMATTER_FIELDS + ("image", "kind")`.
- **Rationale**: The frontmatter field set is small and fully controlled by `ArticleFrontmatter`; a tiny audited emitter avoids a `pyyaml` dependency review and is trivially unit-tested. Determinism (stable field order) keeps commits idempotent.
- **Alternatives**: add `pyyaml`+`types-PyYAML` (rejected — new dep for a 6-field object).

### AD-7: `GeneratedArticle` → `ArticleDoc` mapping stays Minion-internal
- **Choice**: A new `publish/models.py:ArticleDoc` (Pydantic) captures the persisted shape (date, slug, theme, frontmatter, body, linkedin, image filename, commitSha, published). Not promoted to `shared/schema/` in F-006.
- **Rationale**: Per Open Q#1 follow-up — promote a shared `article.json` only when F-009 consumes it, so the cross-boundary contract is designed against a real reader. Until then `extra="forbid"` Pydantic guards the boundary.
- **Alternatives**: define `shared/schema/article.json` now (deferred to F-009).

## Affected Files

### New Files
| File | Purpose |
|------|---------|
| `minion/src/minion/publish/__init__.py` | Subpackage marker. |
| `minion/src/minion/publish/models.py` | `ImageArtifact`, `CommitResult`, `ArticleDoc` Pydantic models (FR-8). |
| `minion/src/minion/publish/ports.py` | `ImageGenerator`, `PromptRewriter`, `ContentRepository` Protocols + `ImagenBlockedError`, `ContentRepoError` (AD-2). |
| `minion/src/minion/publish/imagen.py` | `VertexImageGenerator` + `ClaudePromptRewriter` (promoted from `spike/imagen.py`, strict-typed). |
| `minion/src/minion/publish/github.py` | `GitHubContentRepository` (promoted from `spike/github.py`, strict-typed). |
| `minion/src/minion/publish/serialize.py` | `slugify` + `render_post` (AD-6). |
| `minion/src/minion/publish/fakes.py` | `FakeImageGenerator`, `FakePromptRewriter`, `FakeContentRepository` (hermetic). |
| `minion/src/minion/publish/assets/placeholder.webp` | Committed generic Le Veilleur placeholder image (AD per Open Q#7). |
| `minion/src/minion/steps/publish.py` | `ImagenStep`, `GithubStep`, `PublishStep` (FR-1/2/3/5/6). |
| `minion/tests/test_imagen_step.py` | Imagen generation + moderation→rewrite→placeholder fallback. |
| `minion/tests/test_github_step.py` | Two-file idempotent commit + 3× retry + persist-before-fail. |
| `minion/tests/test_publish_step.py` | Article persistence (idempotent), web-push stubbed. |
| `minion/tests/test_serialize.py` | `slugify` + `render_post` determinism + quoting. |
| `minion/tests/test_warning_propagation.py` | Orchestrator `success_with_warnings` precedence (AD-4). |
| `minion/tests/test_publish_integration.py` | Gated (`integration` marker) real Vertex/GitHub smoke. |

### Modified Files
| File | Change |
|------|--------|
| `minion/src/minion/steps/base.py` | Add `warning: str \| None = None` to `StepResult` (AD-4). |
| `minion/src/minion/orchestrator.py` | Latch `warning_reason`; finalize `success_with_warnings` per AD-4 precedence. |
| `minion/src/minion/steps/__init__.py` | `build_pipeline` gains `image_generator`, `prompt_rewriter`, `content_repo`, `article_store`; wires the three real steps; only `publish`'s web-push stays internally stubbed. |
| `minion/src/minion/steps/stubs.py` | Drop the `imagen`/`github`/`publish` canned payloads (now real). |
| `minion/src/minion/store/ports.py` | Add `ArticleStore` Protocol (AD-3). |
| `minion/src/minion/store/firestore.py` | Add `FirestoreArticleStore` (`articles/{date}`). |
| `minion/src/minion/store/memory.py` | Add `InMemoryArticleStore`. |
| `minion/src/minion/config.py` | Add Imagen (project/location/model/brand template), GitHub (repo/branch/path templates/retries/backoff), `ARTICLES_COLLECTION`, `SLUG_MAX_LEN`, placeholder asset name. |
| `minion/src/minion/cli.py` | `build_clients`/`build_stores` construct the new adapters; pass to `build_pipeline`. |

## Implementation Phases

### Phase 1: Models, ports, config, serialization (foundation)
- `publish/models.py`, `publish/ports.py`, `publish/serialize.py`, and the `config.py` constants.
- `ArticleStore` port + `InMemoryArticleStore` + `FirestoreArticleStore`.
- `StepResult.warning` field (AD-4).
- Unit tests for `serialize` (slug + frontmatter) — pure functions, fastest feedback.

### Phase 2: Adapters + steps (business logic)
- Promote `spike/imagen.py` → `publish/imagen.py` (`VertexImageGenerator`, `ClaudePromptRewriter`) and `spike/github.py` → `publish/github.py` (`GitHubContentRepository`), strict-typed behind the ports; add `publish/fakes.py`.
- `steps/publish.py`: `ImagenStep` (FR-1/2 incl. fallback + warning), `GithubStep` (FR-3/4/6 persist-before-commit + 3× retry), `PublishStep` (FR-5 reader-doc upsert; web-push stub).
- Step-level unit tests against the fakes.

### Phase 3: Wiring + orchestrator + end-to-end (integration)
- `orchestrator.py` warning propagation (AD-4) + `test_warning_propagation.py`.
- `steps/__init__.py` `build_pipeline` new params; remove stubs; `cli.py` composition root.
- Full fake end-to-end run test (`gmail`→…→`publish`) producing an article doc + commit + image (AC-8).
- Gated integration test (real Vertex + GitHub), excluded from CI by the `integration` marker.

## Test Strategy
- **Mocking approach**: ports + in-memory fakes (no network), per CLAUDE.md / F-004–F-005 convention. `FakeImageGenerator` scripts a sequence of `ok`/`blocked` outcomes; `FakePromptRewriter` records calls and returns a softened string; `FakeContentRepository` records `put_file` calls (path→content→sha) and can be scripted to fail N times then succeed; `InMemoryArticleStore` records upserts by date. Real Vertex/GitHub only under the `integration` marker (excluded via `addopts = -m 'not integration'`).
- **Happy paths**: imagen returns WebP + back-fills `frontmatter.image` (AC-1); github commits both files and returns SHAs, replay overwrites via sha (AC-3); publish upserts the reader doc idempotently (AC-5); full run is green end-to-end (AC-8).
- **Error scenarios**: moderation reject → one rewrite → second reject → placeholder + `success_with_warnings` (AC-2/AC-6); github non-2xx → 3× backoff → hard fail with artefact already persisted (AC-4); missing PAT → hard fail; Firestore article write failure → 3× then hard fail.
- **Edge cases**: slug from titles with accents/punctuation/over-length; warning never overrides `failure` or `terminal_status` (AC-6); idempotent replay leaves no duplicate files or docs (constitution §2.7); placeholder asset loads via `importlib.resources` without filesystem assumptions.

## Risk & Complexity
- **Estimated complexity**: Medium (two external integrations already de-risked by the spike; the orchestrator change is small and surgical).
- **Key risks**:
  - *Imagen moderation behavior* on themed prompts (PRD R2) — mitigated by the rewrite→placeholder fallback proven structurally with fakes; real behavior validated in burn-in (F-013).
  - *GitHub idempotency* (update-with-sha race, PRD R4) — the spike's GET-sha-then-PUT pattern is carried over; single-run-per-day makes races unlikely.
  - *`success_with_warnings` precedence* regressions — covered by `test_warning_propagation.py`.
  - *Target repo migration* — `allienna/veilleur-app` is a deliberate placeholder; switching to `allienna/veilleur` is a one-constant change tracked for F-007/F-013.
- **New dependencies**: none — `pillow`, `google-genai`, `httpx` are already in `pyproject.toml`; frontmatter serialization is dependency-free (AD-6).
