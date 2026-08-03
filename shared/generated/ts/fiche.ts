/* eslint-disable */
/**
 * AUTO-GENERATED from shared/schema — DO NOT EDIT BY HAND.
 * Regenerate with: pnpm --filter @veilleur/shared run gen
 */

/**
 * Per-source analysis persisted to Firestore `fiches/{slug}` (the document key is `slug`, derived from the source title). Written server-side by the Minion `fiches` step, one per source cited in a published article's `## Sources` section. Read by the PWA fiches surface (behind the article's "Consulter toutes les analyses de cet article" CTA). Field names are snake_case to match the persisted document.
 */
export interface Fiche {
  /**
   * URL slug derived from the source title. Firestore document key.
   */
  slug: string;
  /**
   * The analyzed source's original URL.
   */
  url: string;
  /**
   * The source's title.
   */
  title: string;
  /**
   * The fiche's tech-watch theme; rendered as a TagPill in the PWA.
   */
  theme: string;
  /**
   * Free-text keywords for this source.
   */
  keywords: string[];
  /**
   * The source's tone (e.g. opinion, tutorial, research, news), if identifiable.
   */
  tone?: string | null;
  /**
   * Publication dates (YYYY-MM-DD) of every article that cited this source. Grows via array-union on re-citation: a source analyzed once keeps its most recent analysis but accumulates every date it was cited on.
   */
  used_in: string[];
  /**
   * Fiche body (Markdown): `## Résumé`, `## Points clés`, `## Analyse approfondie`, `## Pourquoi ça compte` sections, in that order.
   */
  body: string;
  /**
   * ISO 8601 timestamp of the most recent (re)generation of this fiche.
   */
  created_at: string;
}
