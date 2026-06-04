# Review: Ingestion resilience — local content extraction (F-015)

**Reviewed**: 2026-06-04
**Branch**: feat/015-ingestion-local-extraction
**Verdict**: **Pass with notes** (ready to merge; AC-6 verified in burn-in post-merge)

## Task completion
8/9 tasks done (T-1.1…T-2.3, T-3.1). T-3.2 (production smoke + burn-in row) is operator-run post-merge and explicitly non-gating, mirroring F-013's device ACs.

## Quality gates
- `uv run ruff check .` — pass
- `uv run ruff format --check .` — pass
- `uv run pyright` — 0 errors, 0 warnings
- `uv run pytest` — 176 passed, 2 deselected (incl. 11 new `test_scraper_client` cases)

## Acceptance criteria
- **AC-1** ✅ `LocalExtractorClient` (`ingest/scraper.py`) fetches via httpx + extracts via trafilatura, one `ScrapedSource` per URL, markdown+title on `ok`.
- **AC-2** ✅ Browser UA + redirects + timeout; retries transient; non-HTML / empty / blocked → `failed`. Verified with `httpx.MockTransport` (8 fetch-path cases).
- **AC-3** ✅ Paywall markers recalibrated for raw HTML (schema.org `isAccessibleForFree:false` + visible CTAs), provenance documented in `config.py`; paywalled fixture → `paywalled`, article → `ok`. *Note: markers are a conservative starter set — empirical refinement against captured burn-in HTML is expected (FR-3).*
- **AC-4** ✅ Renamed `JinaClient`→`ScraperClient`, `JinaReaderClient`→`LocalExtractorClient`, `JinaStep`→`ScrapeStep`, `FakeJinaClient`→`FakeScraperClient`, `JINA_*`→`SCRAPE_*` (`JINA_BASE_URL` dropped); `jina.py`/`test_jina_client.py` deleted, `test_jina_step.py`→`test_scrape_step.py`. `grep -rn "JinaClient\|JinaStep\|JinaReader\|FakeJina" src tests` → empty. `StepName.jina` wire value **retained** (shared-schema/PWA contract) + clarifying comment; constitution module-shape updated.
- **AC-5** ✅ `trafilatura>=2.0` in `pyproject.toml` + `uv.lock`; `cli.build_clients` wires `LocalExtractorClient`; gates green. *build-minion CI verified on push.*
- **AC-6** ⏳ **Deferred to burn-in (post-merge, non-gating).** A real production smoke must clear the ≥50%/≥5 gate; recorded in the F-013 burn-in log as the first clean post-F-015 run.
- **AC-7** ✅ Ingestion state machine, Gmail step, `ScrapedSource` taxonomy, ≥50%/≥5 gate semantics unchanged — `test_validate_input` + `test_ingestion_pipeline` pass unmodified.

## Spec adherence
Matches the plan: engine swapped behind the existing port reusing the pool/retry/deadline scaffolding; rename scoped to minion-internal symbols (no shared-schema/PWA churn). `httpx` content-type gate added (non-HTML → `failed`) — a small, sensible extension beyond the plan's letter.

## Risks / notes for merge
- **Real-world extraction yield** is unproven until burn-in (AC-6). If `ok`-rate sits just under 50%, the deferred decision fires (relax `MIN_SOURCES_FRACTION` or add the port's hosted fallback). Tracked as a spec open question — not a code defect.
- **Paywall markers** are provisional; over/under-matching is a tuning risk, mitigated by the conservative allowlist + the planned burn-in refinement.
- No behavior change to the gate or taxonomy → low regression risk for the merged pipeline.

## Conclusion
Code-complete and green. Merge unblocks F-013 burn-in (the rate-limit blocker is removed). AC-6 + paywall-marker refinement happen in burn-in, post-merge.
