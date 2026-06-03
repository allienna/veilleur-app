/* eslint-disable */
/**
 * AUTO-GENERATED from shared/schema — DO NOT EDIT BY HAND.
 * Regenerate with: pnpm --filter @veilleur/shared run gen
 */

/**
 * Shape of a published article document persisted to Firestore `articles/{date}` (the document key is `date`). Written server-side by the Minion `publish` step via `model_dump(mode="json")`; read by the PWA reading surface (F-009). Field names are snake_case to match the persisted document. Source of truth for the Minion publish model and the PWA article repository.
 */
export interface Article {
  /**
   * Publication date in YYYY-MM-DD (Europe/Paris). Firestore document key and idempotency key.
   */
  date: string;
  /**
   * URL slug derived from the article title.
   */
  slug: string;
  /**
   * The article's tech-watch theme; rendered as a TagPill in the PWA.
   */
  theme: string;
  frontmatter: Frontmatter;
  /**
   * Article body (Markdown), rendered with the prose-veilleur tokens.
   */
  body: string;
  /**
   * Ready-to-post LinkedIn text (≤3000 chars). Consumed by the PWA share sheet (F-010).
   */
  linkedin: string;
  /**
   * Hero image filename, e.g. "2026-06-01.webp" (mirrors frontmatter.image). Resolved by the PWA against the public Astro images base URL.
   */
  image: string;
  /**
   * GitHub commit SHA set by the `publish` step once the article lands on the Astro site; null before the commit.
   */
  commit_sha?: string | null;
  /**
   * False = recoverable pre-commit persist; true = live on the public site.
   */
  published?: boolean;
}
/**
 * Astro content-collection frontmatter for the generated article.
 */
export interface Frontmatter {
  /**
   * Article title.
   */
  title: string;
  /**
   * Publication date in YYYY-MM-DD.
   */
  date: string;
  /**
   * Short article description / excerpt.
   */
  description: string;
  /**
   * Theme tags.
   */
  tags: string[];
  /**
   * Hero image filename; empty at generation time, filled by the Imagen step.
   */
  image?: string;
  /**
   * Content kind (veille | blog).
   */
  kind?: string;
}
