import type { Article } from "@veilleur/shared/article";
import { Link } from "react-router-dom";

import { TagPill } from "@/components/TagPill";
import { formatDateShort } from "@/lib/format";
import { heroUrl } from "@/lib/hero";
import { cn } from "@/lib/utils";

// `ArticleCard` — listing tile, ported from ../veilleur/site's ArticleCard.astro (DESIGN §2).
// Note there is deliberately no card chrome: the Astro card has no border, background or shadow of
// its own — only the image is rounded and shadowed, and the text sits on the page background. The
// whole tile is one link (the Astro markup uses two, on the image and the title, for the same
// target; one is equivalent visually and quieter for screen readers).
export function ArticleCard({ article }: { article: Article }): JSX.Element {
  const isBlog = article.frontmatter.kind === "blog";
  const tags = article.frontmatter.tags?.length ? article.frontmatter.tags : [article.theme];
  return (
    <Link to={`/article/${article.date}`} className="group flex flex-col">
      <div
        className={cn(
          // Astro's `rounded-xl` is 12px — this app's `rounded-lg`. (`rounded-xl` here is 16px.)
          "relative mb-5 aspect-video w-full overflow-hidden rounded-lg shadow-sm",
          isBlog ? "ring-2 ring-navy/30" : "border border-border-subtle",
        )}
      >
        <img
          src={heroUrl(article.image)}
          alt=""
          loading="lazy"
          width={800}
          height={450}
          className="h-full w-full object-cover transition-transform duration-slow ease-standard group-hover:scale-105"
        />
        <span
          className={cn(
            "absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider shadow-sm",
            isBlog ? "bg-navy text-fg-inverted" : "bg-primary text-bg-inverted",
          )}
        >
          {isBlog ? "Article" : "Veille"}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-sm">
        {tags.slice(0, 3).map((tag) => (
          <TagPill key={tag} label={tag} />
        ))}
      </div>
      <h2 className="mb-2 text-xl font-bold leading-snug text-fg transition-colors duration-base ease-standard group-hover:text-primary">
        {article.frontmatter.title}
      </h2>
      <p className="text-sm font-medium text-fg-muted">
        <time dateTime={article.date}>{formatDateShort(article.date)}</time>
        {isBlog ? (
          <span className="ml-1.5 inline-block rounded-sm bg-navy/10 px-2 py-0.5 align-middle text-xs font-semibold text-navy">
            Billet personnel
          </span>
        ) : null}
      </p>
    </Link>
  );
}
