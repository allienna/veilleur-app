import type { Article } from "@veilleur/shared/article";
import { useState } from "react";

import { TagPill } from "@/components/TagPill";
import { formatDateLong } from "@/lib/format";
import { heroUrl } from "@/lib/hero";

// `ArticleView` — full article reader (DESIGN §2; prose-veilleur, hero image, share footer).
// The share footer slot is reserved for the F-010 ShareSheet — not wired here.
export function ArticleView({ article }: { article: Article }): JSX.Element {
  // Hero failure must not blank the reader — the body still renders (LCP is text-first).
  const [heroFailed, setHeroFailed] = useState(false);
  return (
    <article className="mx-auto max-w-reading px-md sm:px-lg">
      {article.image && !heroFailed ? (
        <img
          src={heroUrl(article.image)}
          alt=""
          className="mb-lg aspect-video w-full rounded-xl object-cover"
          onError={() => setHeroFailed(true)}
        />
      ) : null}
      <div className="space-y-sm">
        <TagPill label={article.theme} />
        <h1 className="text-display font-display text-fg">{article.frontmatter.title}</h1>
        <p className="text-caption text-fg-muted">{formatDateLong(article.date)}</p>
      </div>
      <div className="prose-veilleur mt-lg whitespace-pre-wrap text-body text-fg">
        {article.body}
      </div>
      {/* Reserved: ShareSheet footer (F-010). */}
      <footer data-testid="share-footer-slot" className="mt-2xl" />
    </article>
  );
}
