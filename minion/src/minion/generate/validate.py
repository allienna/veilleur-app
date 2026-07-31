"""Pure, deterministic validators for the generated artefact (F-005 FR-4/FR-5).

No I/O — easy to unit-test and to tune during burn-in (F-013). `validate_structure` covers the
PRD §3 caps + frontmatter completeness; `validate_copyright` enforces constitution §4 / FR-A3
against the original source texts; `validate_article` combines them into a `ValidationReport`.
Token budgets use a char heuristic (AD-10/AD-12), a guard rather than an exact bound.
"""

from __future__ import annotations

import math
import re
from urllib.parse import urlparse

from minion import config
from minion.generate.models import (
    ContextSource,
    GeneratedArticle,
    ValidationError,
    ValidationReport,
)

# Direct-quote spans: French guillemets, straight quotes, and curly quotes.
_QUOTE_RE = re.compile(r"«\s*(.+?)\s*»|\"(.+?)\"|“(.+?)”", re.DOTALL)
_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)


def estimate_tokens(text: str) -> int:
    """Approximate token count for a budget guard: ~4 characters per token (AD-10)."""
    return math.ceil(len(text) / 4)


def _normalize_tokens(text: str) -> list[str]:
    """Lowercase, drop punctuation, collapse whitespace → a token list for overlap checks."""
    return _WORD_RE.sub(" ", text.lower()).split()


def _paragraphs(text: str) -> list[str]:
    return [p for p in re.split(r"\n\s*\n", text) if p.strip()]


def _ngrams(tokens: list[str], n: int) -> set[tuple[str, ...]]:
    return (
        {tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1)}
        if len(tokens) >= n
        else set()
    )


def _find_quotes(text: str) -> list[str]:
    return [next(g for g in m.groups() if g is not None) for m in _QUOTE_RE.finditer(text)]


def _strip_quotes(text: str) -> str:
    return _QUOTE_RE.sub(" ", text)


def validate_structure(article: GeneratedArticle) -> list[ValidationError]:
    """Frontmatter completeness + length/word/output-token caps (FR-4)."""
    errors: list[ValidationError] = []

    for field in config.REQUIRED_FRONTMATTER_FIELDS:
        value = getattr(article.frontmatter, field, None)
        if value is None or (isinstance(value, str) and not value.strip()) or value == []:
            errors.append(
                ValidationError(
                    code="frontmatter_incomplete",
                    message=f"required frontmatter field '{field}' is missing or empty",
                )
            )

    if len(article.linkedin) > config.MAX_LINKEDIN_CHARS:
        errors.append(
            ValidationError(
                code="linkedin_too_long",
                message=(
                    f"LinkedIn post {len(article.linkedin)} > {config.MAX_LINKEDIN_CHARS} chars"
                ),
            )
        )

    if len(article.image_prompt) > config.MAX_IMAGE_PROMPT_CHARS:
        errors.append(
            ValidationError(
                code="image_prompt_too_long",
                message=(
                    f"image prompt {len(article.image_prompt)} > "
                    f"{config.MAX_IMAGE_PROMPT_CHARS} chars"
                ),
            )
        )

    word_count = len(article.body.split())
    if word_count > config.MAX_ARTICLE_WORDS:
        errors.append(
            ValidationError(
                code="article_too_long",
                message=f"article {word_count} > {config.MAX_ARTICLE_WORDS} words",
            )
        )

    output_tokens = estimate_tokens(article.body + article.linkedin + article.image_prompt)
    if output_tokens > config.MAX_GENERATE_OUTPUT_TOKENS:
        errors.append(
            ValidationError(
                code="output_too_large",
                message=f"~{output_tokens} > {config.MAX_GENERATE_OUTPUT_TOKENS} output tokens",
            )
        )

    return errors


def validate_copyright(
    article: GeneratedArticle, sources: list[ContextSource]
) -> list[ValidationError]:
    """Deterministic copyright rules over the original sources (constitution §4 / FR-A3, FR-5).

    Quoted spans (`« »` / `"…"`) are governed by the quote rules; the wholesale-reproduction
    n-gram check runs on the body with quotes *stripped*, so a legitimate ≤30-word attributed
    quote is not double-flagged as reproduction.
    """
    errors: list[ValidationError] = []
    body = article.body

    # 1. Direct-quote length and per-source count.
    #
    # A quote counts toward a source's per-source limit only when it appears verbatim in
    # *exactly one* source. With many topically-overlapping sources, a short normalized quote is
    # a substring of several sources' markdown; attributing it to every container inflates counts
    # and trips `too_many_quotes` on phrasing the article never over-quoted (the model then can't
    # satisfy the retry). A span shared by ≥2 sources is common reporting, not single-source
    # over-quoting, so it pins to none. Identical spans are de-duplicated (constitution §4 / FR-5).
    per_source_quotes: dict[str, list[str]] = {s.url: [] for s in sources}
    normalized_sources = {s.url: " ".join(_normalize_tokens(s.markdown)) for s in sources}
    seen_quotes: set[str] = set()
    for quote in _find_quotes(body):
        normalized_quote = " ".join(_normalize_tokens(quote))
        if not normalized_quote or normalized_quote in seen_quotes:
            continue
        seen_quotes.add(normalized_quote)
        if len(quote.split()) > config.MAX_QUOTE_WORDS:
            errors.append(
                ValidationError(
                    code="quote_too_long",
                    message=f"direct quote exceeds {config.MAX_QUOTE_WORDS} words",
                )
            )
        # Only substantial spans count toward the per-source limit: short quoted spans are
        # product names / labels / emphasis, not copyrightable excerpts (constitution §4 intent).
        if len(quote.split()) < config.MIN_COUNTED_QUOTE_WORDS:
            continue
        containing = [url for url, text in normalized_sources.items() if normalized_quote in text]
        if len(containing) == 1:
            per_source_quotes[containing[0]].append(quote)
    for source in sources:
        quotes = per_source_quotes[source.url]
        if len(quotes) > config.MAX_QUOTES_PER_SOURCE:
            errors.append(
                ValidationError(
                    code="too_many_quotes",
                    # Include the offending spans so burn-in can judge real over-quoting vs a
                    # validator artefact without re-running (F-013).
                    message=(
                        f"more than {config.MAX_QUOTES_PER_SOURCE} quote(s) from "
                        f"{source.url}: {quotes!r}"
                    ),
                )
            )

    # 2. Wholesale reproduction: shared run of ≥ WHOLESALE_NGRAM tokens, quotes excluded (AD-6).
    article_ngrams: set[tuple[str, ...]] = set()
    for paragraph in _paragraphs(_strip_quotes(body)):
        article_ngrams |= _ngrams(_normalize_tokens(paragraph), config.WHOLESALE_NGRAM)
    for source in sources:
        source_ngrams: set[tuple[str, ...]] = set()
        for paragraph in _paragraphs(source.markdown):
            source_ngrams |= _ngrams(_normalize_tokens(paragraph), config.WHOLESALE_NGRAM)
        shared = source_ngrams & article_ngrams
        if shared:
            # Surface one shared run so burn-in can tell genuine copying from common boilerplate
            # (e.g. a stock funding-round phrase) without re-running (F-013).
            sample = " ".join(next(iter(shared)))
            errors.append(
                ValidationError(
                    code="wholesale_reproduction",
                    message=f"article reproduces a passage of {source.url} verbatim: {sample!r}",
                )
            )

    # 3. Attribution: a referenced source (name/domain in body) must link its URL (AD-7).
    #
    # The domain check must only match a domain mentioned in *readable prose*, not one merely
    # embedded inside another citation's markdown link target — e.g. two sources sharing a
    # tracking-redirector domain (`tracking.tldrnewsletter.com/CL0/...`) or the same publication
    # would otherwise cross-contaminate: citing source A makes A's domain appear in body text via
    # its own `(url)`, which then falsely flags every *other*, genuinely-uncited source B on that
    # same domain as "referenced but not attributed" (the 2026-07-31 burn-in false positive).
    prose_only = re.sub(r"\]\(https?://[^\s)]+\)", "]", body)
    lower_prose = prose_only.lower()
    for source in sources:
        domain = urlparse(source.url).netloc.lower().removeprefix("www.")
        referenced = (domain and domain in lower_prose) or (
            bool(source.title) and source.title.lower() in lower_prose
        )
        if referenced and source.url not in body:
            errors.append(
                ValidationError(
                    code="missing_attribution",
                    message=f"source {source.url} is referenced but its link is absent",
                )
            )

    return errors


def validate_article(article: GeneratedArticle, sources: list[ContextSource]) -> ValidationReport:
    """Combine structural + copyright validation into a single report (the gate of record)."""
    return ValidationReport(
        errors=validate_structure(article) + validate_copyright(article, sources)
    )
