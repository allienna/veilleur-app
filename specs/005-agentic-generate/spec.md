# Spec: Agentic step `/generate` (the talk artefact)

**Track ID**: 005-agentic-generate
**Roadmap ref**: F-005
**Status**: In Progress
**Created**: 2026-06-02
**Branch**: feat/005-agentic-generate
**PRD sections**: FR-A2 (agentic call + output validation), FR-A3 (copyright safety), §3 caps (token/length), §4 Performance (`/generate` ≤4 min), §6 Failure-Mode Policies (Claude error / validation / theme), §5 Integrations (Claude CLI), constitution §2 principles 2 & 4
**Depends on**: F-004 — Minion ingestion (**merged** #8); the pinned `allienna/claude-feature-flow` plugin that ships the `/generate` slash command (installed in the Minion image — F-007; a setup prerequisite, not a code track here)

## Context

This is the pipeline's beating heart and **the on-stage thesis incarnated**: the Minion shells
out to `claude -p "/generate"` and the runtime *literally executes a versioned spec* — the
`/generate` slash command — to turn the day's scraped sources into a publishable artefact.

F-004 left the run at the doorstep of context assembly: it produces a validated `SourceSet`
(OK sources with clean Markdown) in the data bag and gates on the ≥50%/≥5 threshold. F-005
implements the next three pipeline steps, currently stubs:

- **`assemble`** (step 4) — deterministically package the validated sources into the context
  bundle the agent consumes, within the 500k input-token budget.
- **`generate`** (step 5) — the single agentic call: invoke `claude -p "/generate"` (OAuth-only,
  `bypassPermissions`), which detects the day's dominant **theme**, drafts a transformative
  synthesis **article** (Astro frontmatter + body), writes the **image prompt**, and writes the
  **LinkedIn** catch-up post — all sharing one context (PRD §2). Parse its output into a typed
  artefact.
- **`validate_output`** (step 6) — deterministically validate that artefact: frontmatter
  completeness, length caps, theme allowlist, **and** the copyright post-validator (constitution
  §4 / FR-A3). On any failure, feed the errors back and retry the agentic call (max 2).

The `/generate` command itself is **not in this repo** — per constitution §3 it lives in the
`allienna/claude-feature-flow` plugin as pinned, versioned production code, installed into the
Minion image (F-007). F-005 owns the Minion side of the boundary: assembling the input,
invoking the subprocess under the right auth, parsing + validating the output, and the retry
loop. The remaining steps (`imagen`, `github`, `publish`) stay stubs for F-006/F-012.

## User Stories

- As the **operator**, I want Claude to detect the day's dominant theme, draft a transformative
  synthesis article, write the image prompt, and write the LinkedIn catch-up post in a **single
  agentic call** so every generative step shares one context.
- As the **operator**, I want the generated article to obey copyright-safe rules (short attributed
  quotes, no wholesale reproduction) automatically, so I never publish something legally unsafe.
- As the **operator**, I want a malformed or non-compliant generation to be **retried with the
  errors fed back** (not silently published or hard-failed on the first wobble), so transient
  model mistakes self-correct.
- As the **operator**, I want the agentic call to authenticate via OAuth only
  (`CLAUDE_CODE_OAUTH_TOKEN`), never the API-key fallback, so the run stays inside the Max-5×
  cost envelope (constitution §2 principle 2).
- As a **developer**, I want the `claude -p` subprocess behind an injected port so the whole
  pipeline tests hermetically — no `claude` binary, no plugin, no network in CI.
- As a **developer**, I want every artefact boundary (assembled context, generated article,
  validation report) to be a Pydantic model so malformed generation fails loudly at the boundary.

## Functional Requirements

### FR-1: Real `assemble` step — context assembly within the input budget
Replace the `assemble` stub with a deterministic step that reads the validated `SourceSet`
(F-004) from the data bag and builds a typed **context bundle** (per-source title, URL, and
clean Markdown, in a stable order) that the `generate` step passes to `/generate`. The bundle is
constrained to the **500k input-token** cap (§3): if the sources exceed it, the step drops
lowest-priority sources (ordering rule — Open Questions) and **logs** the truncation. Only `ok`
sources are included; paywalled/failed are absent (already excluded upstream).

### FR-2: Real `generate` step — the agentic invocation
Replace the `generate` stub with an invocation of `claude -p "/generate"` carrying
`--permission-mode bypassPermissions` (promoting the F-001 spike's `claude_probe` pattern out of
`spike/`). The assembled context is passed as the command input (mechanism — Open Questions). The
subprocess is wrapped behind an injected **runner port** (`GenerateRunner`) so production uses the
real subprocess and tests use a fake. A Claude **transport** failure — binary missing, non-zero
exit, timeout, 5xx/rate-limit — triggers **2 retries with exponential backoff** (PRD §6), then a
hard fail. (Transport retries are distinct from the validation retries of FR-6.)

### FR-3: Output contract + parse into a typed artefact
Define the structured artefact `/generate` returns and how the Minion receives it (stdout JSON vs
written files — Open Questions), and parse it into a `GeneratedArticle` Pydantic model:
`theme`, the Astro **frontmatter** fields, the article **body** (Markdown), the **linkedin** post,
and the **image_prompt**. Output that cannot be parsed into the model is treated as a *validation
failure* feeding the FR-6 retry loop (not a transport error).

### FR-4: `validate_output` step — deterministic structural validation
Replace the `validate_output` stub with deterministic checks (PRD FR-A2):
- **Astro frontmatter complete** — every required field present and well-formed (field set —
  Open Questions, pinned from the external Astro content schema).
- **LinkedIn post ≤ 3000 chars** (LinkedIn's own limit).
- **Image prompt ≤ 1000 chars.**
- **Article ≤ 10k words** (§3).
- **Theme** ∈ the known allowlist or the literal `"other"`. An unknown theme **defaults to
  `"other"` and continues** — not an error (PRD §6).

### FR-5: Copyright post-validator (constitution §4 / FR-A3)
A deterministic validator run over the generated article against the **original source texts**
(the F-004 `SourceSet` markdown), enforcing:
- Direct quotes **≤ 30 words** per source, **≤ 1 substantial (≥6-word) quote** per source, counted
  only against the single source a quote appears in verbatim (constitution §4 recalibration,
  F-013 burn-in: short spans like product names don't count; phrasing shared by ≥2 sources pins to
  none). Threshold `MIN_COUNTED_QUOTE_WORDS=6`.
- Every cited fact **attributes its source by name and links its URL** (tractable rule — Open
  Questions).
- **No paragraph reproduces a source paragraph wholesale** — an n-gram / shingle overlap check;
  `WHOLESALE_NGRAM=20` normalized tokens (recalibrated from 12 in F-013 burn-in — a 12-token run
  of generic prose was a false positive).
- **No paywalled source content** appears (assert none leaked; they are excluded upstream).
Violations are validation failures feeding the FR-6 retry loop.

### FR-6: Agentic retry loop (max 2)
`generate` + `validate_output` form a loop: on any validation failure (FR-3 parse, FR-4
structural, or FR-5 copyright), re-invoke `/generate` with the **validation errors fed back as
additional input** (mechanism — Open Questions), up to **2 retries**. The first compliant artefact
wins. Exhausting the retries **hard-fails** the run with the accumulated validation errors
recorded in the step/run error.

### FR-7: OAuth-only auth boundary (constitution §2 principle 2)
The `generate` subprocess environment **injects `CLAUDE_CODE_OAUTH_TOKEN`** (from Secret Manager
`anthropic-oauth-token`) and **removes `ANTHROPIC_API_KEY`** before spawning, exactly as the spike
established. The API-key fallback is never used by the default path.

### FR-8: Pydantic boundaries + hermetic testability
The assembled context, `GeneratedArticle`, and the validation report are Pydantic models; raw
generation text never crosses a step boundary unvalidated. The `claude -p` subprocess sits behind
the `GenerateRunner` port with an in-memory fake (the F-004 ports+fakes pattern), so
`ruff/format/pyright/pytest` run green **without** the `claude` binary, the plugin, or network.
Token/length caps live in `config.py`.

### FR-9: Plugin dependency & version pin (constitution §3)
`/generate` is consumed as the pinned `allienna/claude-feature-flow` plugin installed in the
Minion image (F-007), **not** vendored here. F-005 documents this assumption and the expected
plugin/command version; the real subprocess path is covered by a **gated integration test**
(opt-in, not in CI), while unit/pipeline tests mock the runner.

## External Interfaces

| Interface | Invocation | Purpose |
|-----------|------------|---------|
| Claude Code CLI | `claude -p "/generate" --permission-mode bypassPermissions` (subprocess) | The agentic generation call. Auth: `CLAUDE_CODE_OAUTH_TOKEN` injected, `ANTHROPIC_API_KEY` stripped (constitution §2.2). Input: assembled context; output: the `GeneratedArticle` artefact (contract — Open Questions). |
| Secret Manager | `secrets.require("anthropic-oauth-token")` | Supplies the OAuth token for the subprocess env. |
| `allienna/claude-feature-flow` plugin | installed in the Minion image (F-007) | Ships the versioned `/generate` slash command — production code in an external repo (constitution §3). |

No HTTP APIs are called by F-005. Firestore writes remain the orchestrator's per-step lifecycle
records (F-003); the generated artefact is held in the data bag and persisted later (F-006/F-012).

## Error Scenarios

| Scenario | Expected handling (PRD §6) |
|----------|----------------------------|
| Claude transport error (binary missing / non-zero / timeout / 5xx / rate-limit) | 2 retries with exponential backoff, then hard fail; `generate` step + run `failure` with the cause. |
| Output unparseable into `GeneratedArticle` | Validation failure → FR-6 retry with the parse error fed back. |
| Structural validation fails (frontmatter / length / caps) | Validation failure → FR-6 retry with the specific errors fed back. |
| Copyright validation fails (quote length, over-quoting, wholesale reproduction, missing attribution) | Validation failure → FR-6 retry with the violations fed back. |
| Retries (2) exhausted | Hard fail; run `failure`; accumulated validation errors recorded. |
| Theme not in the allowlist | Default `theme: "other"`, continue — not an error. |
| `CLAUDE_CODE_OAUTH_TOKEN` secret missing | Hard fail before invocation, clear error (no API-key fallback). |
| Context exceeds 500k input tokens | `assemble` drops lowest-priority sources to fit and logs the truncation. |

## Acceptance Criteria

- [ ] AC-1: `assemble` builds a typed context bundle from the validated OK sources within the
      500k-token budget; an over-budget set drops lowest-priority sources and logs the truncation.
- [ ] AC-2: `generate` invokes `claude -p "/generate" --permission-mode bypassPermissions` with
      `CLAUDE_CODE_OAUTH_TOKEN` present and `ANTHROPIC_API_KEY` **absent** from the subprocess env
      (asserted via the injected runner in tests).
- [ ] AC-3: `generate` output parses into `GeneratedArticle` (theme, frontmatter, body, linkedin,
      image_prompt); unparseable output triggers an FR-6 retry rather than a hard fail.
- [ ] AC-4: `validate_output` rejects a missing frontmatter field, a LinkedIn post >3000 chars, an
      image prompt >1000 chars, and an article >10k words; an unknown theme defaults to `"other"`
      and passes.
- [ ] AC-5: the copyright validator rejects a >30-word quote, a second quote from one source, a
      wholesale-paragraph reproduction (n-gram overlap), and a cited fact lacking source
      attribution.
- [ ] AC-6: a validation failure re-invokes `/generate` with the errors fed back (≤2 retries);
      a compliant retry yields a valid article, and exhausting retries hard-fails the run with the
      accumulated errors.
- [ ] AC-7: a Claude transport error retries with exponential backoff (2×) then hard-fails —
      distinct from the validation-retry path.
- [ ] AC-8: all three steps are Pydantic-bounded and the subprocess sits behind `GenerateRunner`;
      `uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest` pass
      with the runner faked (no `claude` binary / plugin / network in CI).
- [ ] AC-9: replaying a date overwrites the prior generated artefact with no duplication
      (idempotency preserved, consistent with F-003).

## Out of Scope

- Imagen image **generation** from the image prompt — F-006 (F-005 only *writes* the prompt).
- GitHub commit of the article + image — F-006.
- Firestore persistence of the article and web-push notification — the `publish` step / F-006,
  F-012 (F-005 leaves the artefact in the data bag).
- The `/generate` slash command's own content — it lives in the `allienna/claude-feature-flow`
  plugin repo; changes there are a separate PR (constitution §3).
- The external Astro content-collection schema definition — owned by the `allienna/veilleur` repo;
  F-005 only *consumes* its required-field set.
- A shared `article.json` cross-boundary schema — deferred to the persistence/PWA-reading feature
  (F-006/F-009); F-005 keeps `GeneratedArticle` Minion-internal (Open Questions).

## Open Questions

1. **`/generate` I/O contract.** How the assembled context is handed in (stdin vs a temp-file path
   argument vs the process cwd) and how the artefact comes back (a single JSON document on stdout
   vs files written to a known directory). Recommendation: context via a temp file + stdout JSON
   artefact — easiest to parse and to mock. May require aligning the shape with the plugin repo.
   Decide in `/plan`.
2. **Required Astro frontmatter fields.** Pin the mandatory field set from the external
   `allienna/veilleur` content-collection config (e.g. title, date, description, tags/theme, image,
   `kind`). Needed before FR-4 "frontmatter complete" is precise.
3. **Theme allowlist source of truth.** A Minion `config.py` constant vs the plugin vs the Astro
   `TagPill` list. Where is the canonical list, and what are its values? Decide in `/plan`.
4. **Wholesale-reproduction threshold (FR-5).** The n-gram size and overlap ratio that counts as a
   violation (e.g. ≥N consecutive shared tokens, or shingle-Jaccard ≥ X). Needs a defensible,
   testable default.
5. **"Attributes its source by name + URL" (FR-5).** A deterministic, tractable rule — e.g. every
   source referenced must appear in a sources/references list with its name and a link resolving to
   one of the provided source URLs. Detecting arbitrary "facts" is out of reach; agree the rule.
6. **`GeneratedArticle`: internal vs shared schema.** Recommendation: Minion-internal Pydantic for
   F-005; promote to a shared `article.json` when persistence lands (F-006/F-009). Confirm.
7. **Retry feedback mechanism (FR-6).** How validation errors are fed back to `/generate` — appended
   to a re-invocation's input, or a structured "previous attempt + errors" payload. Decide in `/plan`.
8. **`assemble` ownership.** Confirm `assemble` belongs to F-005 (it is the `/generate` input prep
   and currently a stub) rather than being split out. Recommendation: F-005 owns it.
9. **Integration test strategy (FR-9).** A gated, opt-in integration test that runs the *real*
   plugin against a fixture mailbox (kept out of CI), with unit/pipeline tests mocking the runner.
   Confirm the gating mechanism (env flag / marker).
10. **Output-token cap (30k) enforcement.** Whether the 30k output cap is enforced by the command,
    by the subprocess, or post-hoc by a length check on the artefact. Recommendation: post-hoc guard
    in addition to whatever the command does.
