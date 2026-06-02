# Spec: Imagen 4 Fast + GitHub publish

**Track ID**: 006-imagen-github-publish
**Roadmap ref**: F-006
**Status**: In Progress
**Created**: 2026-06-02
**Branch**: feat/006-imagen-github-publish
**PRD sections**: FR-A2 (steps 7–8 + `success_with_warnings`), FR-A4 (auto-publish to Astro repo), §4 Performance (Imagen ≤30s/90s, GitHub commit ≤10s/60s), §6 Failure-Mode Policies (Imagen moderation, GitHub push), §5 Integrations (Vertex AI Imagen, GitHub Contents API), constitution §2 principles 5/7/9
**Depends on**: F-005 — Agentic `/generate` (**merged** #9; leaves the validated `GeneratedArticle` in the data bag). F-001 spike (**merged** #5) proved the Vertex Imagen + GitHub Contents chain end-to-end; F-006 promotes that throwaway code to production.

## Context

F-005 leaves the run holding a validated `GeneratedArticle` in the data bag — `theme`,
`frontmatter` (with an **empty `image` field** awaiting the hero filename), `body`, `linkedin`,
and the `image_prompt` — but goes no further. The last three pipeline steps are still F-003
stubs: `imagen` (step 7), `github` (step 8), `publish` (step 9).

F-006 turns the artefact into a **real published article**: it generates the hero image from the
article's own `image_prompt`, commits the markdown + image to the public Astro site repo, and
persists the article to Firestore so the PWA (F-009) has something to read. This is the milestone
where one autonomous local run produces a live post on the site (roadmap M3–M4).

The F-001 spike already proved both external chains: `spike/imagen.py` (Vertex AI Imagen → WebP
bytes) and `spike/github.py` (GitHub Contents API, idempotent-by-date via the update-with-sha
pattern). Per the established migration pattern (`secrets.py` was promoted out of `spike/` in
F-004), F-006 promotes these two modules to **strict-typed production code behind injected ports
with in-memory fakes**, so `ruff`/`pyright`/`pytest` stay green with no Vertex, no GitHub, and no
network in CI. The spike copies stay pyright-excluded and slated for deletion (F-013).

Two pieces of real-world friction this feature must resolve:

1. **Moderation fallback** (PRD §6, R2): Imagen may reject the owl-mascot prompt. The policy is
   an agentic retry (Claude rewrites the prompt softer, ×1), then fall back to a **generic
   placeholder** Le Veilleur image and finish the run as `success_with_warnings` — never a hard
   fail on the image alone.
2. **`success_with_warnings` has no orchestrator path yet.** The status token exists in the
   shared schema, but the orchestrator only knows success / raise-to-failure / graceful
   `terminal_status` halt. F-006 adds a **warning-propagation** mechanism: a step finishes
   normally (pipeline continues) but downgrades the final run status.

## User Stories

- As the **operator**, I want an Imagen 4 Fast illustration of *Le Veilleur* (navy owl, amber
  eyes, Pixar style, 16:9) staged in the day's theme so every published article has a coherent
  visual identity.
- As the **operator**, I want the article and image committed to the public Astro repo
  automatically so publication requires zero human action.
- As the **operator**, I want a moderation-rejected image to degrade to a placeholder (run =
  `success_with_warnings`) rather than fail the whole run, so a fussy safety filter never costs me
  the day's article.
- As the **operator**, I want a transient GitHub failure retried with backoff, and on permanent
  failure I want the article + image preserved in Firestore for manual recovery, so no work is
  lost (PRD §4 reliability — no data loss).
- As the **operator**, I want replaying a date to overwrite the prior image, commit, and Firestore
  document with no duplicates (constitution §2.7 idempotency).
- As a **developer**, I want Vertex AI and GitHub behind injected ports with in-memory fakes, so
  the whole pipeline tests hermetically — no GCP, no GitHub, no network in CI.
- As a **developer**, I want every artefact boundary (image bytes, commit result, persisted
  article doc) to be a Pydantic model so a malformed publish fails loudly at the boundary.

## Functional Requirements

### FR-1: Real `imagen` step — hero image generation (PRD FR-A2 step 7)
Replace the `imagen` stub with a deterministic step that reads the `GeneratedArticle` from the
data bag, builds the final Imagen prompt from the article's `image_prompt` combined with the
fixed Le Veilleur brand template (navy owl, amber eyes, Pixar 3D, 16:9 — promoted from
`SPIKE_IMAGEN_PROMPT`), calls Vertex AI Imagen (`imagen-4.0-fast-generate-001`, IAM-only, no
key), and converts the result to **WebP**. The step writes the image bytes and the resolved hero
filename (`YYYY-MM-DD.webp`) into the data bag, and back-fills `frontmatter.image` so the `github`
step commits markdown that references the image. Vertex is wrapped behind an injected
`ImageGenerator` port (real Vertex client in prod, fake in tests).

### FR-2: Imagen moderation fallback (PRD §6 / R2, → `success_with_warnings`)
On a moderation/safety rejection or an empty response, the step performs **one agentic retry**:
Claude rewrites the prompt softer (mechanism — Open Questions), then re-calls Imagen. If that
also fails, the step uses a bundled **generic Le Veilleur placeholder image** and records a
**warning** that downgrades the final run status to `success_with_warnings` (FR-7). Imagen failure
is **never** a hard run failure (graceful degradation, PRD §6). Vertex quota/5xx transport errors
follow the same fallback path.

### FR-3: Real `github` step — commit article + image (PRD FR-A4, step 8)
Replace the `github` stub with a step that commits **two files** to the public Astro site repo via
the GitHub Contents API (fine-grained PAT, `contents:write`, from Secret Manager
`github-pat-allienna-pages`):
- the article markdown at `site/src/content/posts/YYYY-MM-DD-<slug>.md` (frontmatter + body),
- the hero image at `site/public/images/posts/YYYY-MM-DD.webp`.

It is **idempotent by date** — replaying overwrites prior content via the update-with-sha pattern
(promoted from `spike/github.py`). On a non-2xx / transport error it retries **3×** with
exponential backoff (PRD §6); exhausting the retries is a **hard fail** (FR-6 preserves the
artefact first). GitHub is wrapped behind an injected `ContentRepository` port.

### FR-4: Slug + markdown serialization
Derive the post slug deterministically from the article title (rule — Open Questions; e.g.
lowercase, ASCII-fold, hyphenate, length-capped) and serialize the `GeneratedArticle` to the Astro
content-file format: YAML frontmatter (the F-005 `ArticleFrontmatter` fields, with `image` now
populated) followed by the markdown `body`. The serialized field set must match the external
`allienna/veilleur` content-collection schema (Open Questions — same pin as F-005 AD-5).

### FR-5: `publish` step — persist the article to Firestore (data half of step 9)
Replace the `publish` stub with a step that persists the published article (frontmatter, body,
linkedin, theme, hero image reference, commit SHA) to Firestore so the PWA reads it without hitting
the Astro site (PRD FR-B1). Persistence is **idempotent by date** (overwrites, consistent with
F-003 run docs). The **web-push notification** half of step 9 stays a stub and is deferred to
F-012. *(Scope of this FR is the key decision — see Open Questions #1.)*

### FR-6: No data loss on GitHub failure (PRD §4 reliability)
The article markdown, image bytes, and linkedin draft are persisted to Firestore **before or
independently of** the GitHub commit, so a permanent GitHub failure still leaves a complete,
replayable artefact in Firestore (PRD §4: "all run artefacts persisted even when GitHub push
fails"). Ordering of the `github` and `publish` steps relative to this guarantee — Open Questions.

### FR-7: `success_with_warnings` propagation in the orchestrator
Add a warning-propagation mechanism so a step can finish normally (the pipeline **continues**) yet
downgrade the final run status to `success_with_warnings` (mechanism — e.g. a `warning` field on
`StepResult` the orchestrator latches; Open Questions). The downgrade must not override a later
`failure` or a graceful `terminal_status`. The `imagen` placeholder fallback (FR-2) is the first
producer of this status; the per-step Firestore record stays `success`.

### FR-8: Pydantic boundaries + hermetic testability
The image artefact (bytes + filename + warning flag), the commit result (SHA + paths), and the
persisted article document are Pydantic models; raw bytes / API JSON never cross a step boundary
unvalidated. `ImageGenerator`, `ContentRepository`, and the agentic prompt-rewriter sit behind
ports with in-memory fakes (the F-004/F-005 ports+fakes pattern). Vertex region, Imagen model id,
repo coordinates, path templates, and the brand prompt template live in `config.py`. The real
Vertex/GitHub paths are covered by **gated, opt-in integration tests** (not in CI), consistent with
F-005 FR-9.

### FR-9: Promote spike modules to production
Migrate `spike/imagen.py` and `spike/github.py` into the production package (`minion/src/minion/…`)
as strict-typed, pyright-checked code behind the FR-1/FR-3 ports. The `spike/` copies remain
pyright-excluded and are scheduled for deletion in F-013 (do not delete in this track, mirroring
the `secrets.py` promotion in F-004).

## External Interfaces

| Interface | Invocation | Purpose |
|-----------|------------|---------|
| Vertex AI Imagen | `genai.Client(vertexai=True).models.generate_images(model="imagen-4.0-fast-generate-001", …)` | Generate the 16:9 hero image. Auth: SA IAM `roles/aiplatform.user`, no key (constitution §3). |
| GitHub Contents API | `GET`/`PUT /repos/{owner}/{repo}/contents/{path}` | Commit markdown + image, idempotent by date. Auth: fine-grained PAT `github-pat-allienna-pages` (`contents:write`). |
| Secret Manager | `secrets.require("github-pat-allienna-pages")` | Supplies the GitHub PAT. |
| Claude Code CLI | `claude -p` (reuse F-005 `GenerateRunner` or a sibling port) | The agentic prompt-rewrite for the Imagen moderation fallback (FR-2). |
| Firestore | `RunStore` / a new article accessor | Persist the published article for PWA reading (FR-5). |

## Error Scenarios

| Scenario | Expected handling (PRD §6) |
|----------|----------------------------|
| Imagen moderation rejection / empty response | Agentic softer-prompt rewrite (×1); if still rejected, use generic placeholder image → run `success_with_warnings`. Never a hard fail. |
| Imagen quota / Vertex 5xx | Same fallback path → placeholder → `success_with_warnings`. |
| GitHub push non-2xx / transport error | 3 retries with exponential backoff, then hard fail; article + image + linkedin already in Firestore for manual replay (FR-6). |
| GitHub PAT secret missing | Hard fail before the commit, clear error. |
| Firestore article write fails | Critical: 3 retries, then hard fail (no PWA visibility otherwise — PRD §6). |
| Replaying an existing date | Overwrite image, commit (update-with-sha), and Firestore doc — no duplicates (constitution §2.7). |
| Article body exceeds caps | Already gated by F-005 `validate_output`; F-006 assumes a valid artefact. |

## Acceptance Criteria

- [ ] AC-1: `imagen` generates a 16:9 WebP from the article's `image_prompt` + brand template via
      the injected `ImageGenerator`, writes the bytes + `YYYY-MM-DD.webp` filename to the bag, and
      back-fills `frontmatter.image` (asserted with a fake generator; no Vertex in CI).
- [ ] AC-2: on a fake moderation rejection, `imagen` performs one agentic prompt rewrite, and on a
      second rejection falls back to the placeholder image and marks the run
      `success_with_warnings` — the run is **not** failed, later steps still run.
- [ ] AC-3: `github` commits both the markdown (`site/src/content/posts/YYYY-MM-DD-<slug>.md`) and
      the image (`site/public/images/posts/YYYY-MM-DD.webp`) via the injected `ContentRepository`;
      replaying the same date overwrites via the update-with-sha path with no duplicate files.
- [ ] AC-4: a GitHub non-2xx retries 3× with exponential backoff then hard-fails the run, and the
      article + image + linkedin are present in Firestore beforehand (FR-6, asserted with a fake).
- [ ] AC-5: `publish` persists the article document (frontmatter, body, linkedin, theme, image ref,
      commit SHA) to Firestore idempotently by date; the web-push half remains a stub.
- [ ] AC-6: the orchestrator finalizes a run as `success_with_warnings` when (and only when) a step
      raises the warning flag, while a normal run is `success` and a raising step is still
      `failure`; the warning never overrides a `failure` or graceful `terminal_status`.
- [ ] AC-7: `ImageGenerator`, `ContentRepository`, and the prompt-rewriter are Pydantic-bounded
      ports with in-memory fakes; `uv run ruff check . && uv run ruff format --check . && uv run
      pyright && uv run pytest` pass with no Vertex / GitHub / network (real paths only via gated
      opt-in integration tests).
- [ ] AC-8: a full fake end-to-end run (`gmail`→…→`publish`) produces an article doc in the fake
      store, a commit in the fake repo, and an image in the bag — the first green "publishable
      article" path, all stubs gone except web-push.

## Out of Scope

- **Web-push notification** on run completion — the notification half of the `publish` step is
  F-012 (stays a stub here).
- **Cloud Run / Scheduler deployment, the multi-stage Dockerfile, Vertex/GitHub IAM bindings, and
  the `claude-feature-flow` plugin install** — F-007 (F-006 runs locally against real or faked
  Vertex/GitHub).
- **The Astro site itself** (content-collection schema, layouts, GitHub Pages config) — owned by
  the external `allienna/veilleur` repo; F-006 only *writes into* its `posts/` paths.
- **PWA reading UI** for the persisted article — F-009 (F-006 only writes the Firestore doc).
- **Deleting the `spike/` copies** of `imagen.py` / `github.py` — F-013.
- **A shared cross-boundary `article.json` schema** — may be promoted when F-009 consumes the
  Firestore article doc; F-006 keeps the persisted shape Minion-internal unless Open Question #1
  resolves toward sharing it.

## Open Questions

1. **Does F-006 own the Firestore article persistence (FR-5)?** The roadmap scopes F-006 to "steps
   7–8" (imagen + github), but F-009 (PWA reading) **depends on F-006** and reads articles *from
   Firestore* — so something must persist the article, and no other minion track sits between them.
   **Recommendation: yes — F-006 implements the Firestore-persist half of `publish`, leaving only
   web-push for F-012.** Confirm, as it sets whether F-009 has data to read. If yes, also decide
   whether the persisted shape becomes a shared `article.json` (for F-009) now or later.
2. **Target GitHub repo + branch + paths.** PRD §8/FR-A4 name `allienna.github.io`, but the F-001
   spike documented that repo **does not exist**; the eventual target is `allienna/veilleur`
   (served at `allienna.github.io/veilleur`), with a migration-phase override to
   `allienna/veilleur-app`. Pin the repo, branch, and the exact `posts/` path templates for F-006.
   Decide in `/plan`.
3. **Agentic prompt-rewrite mechanism (FR-2).** Reuse the F-005 `GenerateRunner`/`claude -p` path
   with a different command/prompt, or a dedicated `PromptRewriter` port? And what exactly is fed
   to it (the rejected prompt + a "make it softer/safer" instruction)? Decide in `/plan`.
4. **`success_with_warnings` propagation shape (FR-7).** Add a `warning: str | None` (or bool +
   reason) to `StepResult` that the orchestrator latches into the final status, vs a warnings list
   on the context. Pin the precedence rule (`failure` > `terminal_status` > `success_with_warnings`
   > `success`).
5. **Slug derivation (FR-4).** The deterministic rule from title → URL-safe slug (lowercasing,
   ASCII-folding, hyphenation, length cap, collision behavior for two posts the same day — though
   one-run-per-day makes that rare). Needs a defensible, testable default.
6. **Required Astro frontmatter field set (FR-4).** Same pin as F-005 AD-5 — the mandatory fields
   and serialization order from the external `allienna/veilleur` content-collection config. F-005
   used `("title", "date", "description", "tags")` + `image`/`kind`; confirm this is what the Astro
   site actually requires before committing real content.
7. **Placeholder image source (FR-2).** Bundle a static generic Le Veilleur WebP in the repo
   (committed asset) vs generate-once-and-cache. Recommendation: a committed static asset — simplest
   and fully deterministic. Confirm.
8. **WebP conversion dependency.** The spike used `Pillow` for PNG→WebP. Confirm `Pillow` is an
   accepted production dependency (it is currently only a spike dep) and pin it in `uv.lock`, or
   choose an alternative.
