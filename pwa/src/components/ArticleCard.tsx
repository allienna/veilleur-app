import type { Article } from "@veilleur/shared/article";
import { Link } from "react-router-dom";

import { TagPill } from "@/components/TagPill";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateShort } from "@/lib/format";
import { heroUrl } from "@/lib/hero";

// `ArticleCard` — Today + history article tile (DESIGN §2; lineage with Astro ArticleCard.astro).
export function ArticleCard({ article }: { article: Article }): JSX.Element {
  return (
    <Link
      to={`/article/${article.date}`}
      className="block transition-transform duration-fast ease-standard active:scale-[0.98]"
    >
      <Card className="overflow-hidden">
        <img
          src={heroUrl(article.image)}
          alt=""
          loading="lazy"
          className="aspect-video w-full object-cover"
        />
        <CardContent className="space-y-sm">
          <TagPill label={article.theme} />
          <h3 className="text-h3 font-display text-fg">{article.frontmatter.title}</h3>
          <p className="text-caption text-fg-muted">{formatDateShort(article.date)}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
