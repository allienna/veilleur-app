import type { Article } from "@veilleur/shared/article";
import { Link } from "react-router-dom";

import { ArticleCard } from "@/components/ArticleCard";
import { Container } from "@/components/Container";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SkeletonCard } from "@/components/SkeletonCard";
import { TagPill } from "@/components/TagPill";
import { AUTHOR_AVATAR_URL } from "@/config";
import { listRecentArticles } from "@/data/articles";
import { formatDateLong } from "@/lib/format";
import { heroUrl } from "@/lib/hero";
import { useAsync } from "@/lib/useAsync";

// The newest article, shown as a full-bleed featured entry (Astro index.astro's `hero`): the same
// hero + overlapping-card motif as the reader, but linking through instead of rendering the body.
function FeaturedArticle({ article }: { article: Article }): JSX.Element {
  const tags = article.frontmatter.tags?.length ? article.frontmatter.tags : [article.theme];
  return (
    <article className="group">
      <Link
        to={`/article/${article.date}`}
        className="relative block aspect-[16/9] max-h-[60vh] w-full overflow-hidden"
      >
        <img
          src={heroUrl(article.image)}
          alt=""
          loading="eager"
          width={1600}
          height={900}
          className="h-full w-full object-cover transition-transform duration-slow ease-standard group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-inverted/80 to-transparent" />
      </Link>
      <div className="relative z-10 -mt-4xl mx-auto w-full max-w-reading rounded-t-2xl bg-bg px-md pb-8 pt-xl sm:px-lg">
        <div className="mb-lg flex flex-wrap items-center gap-xs">
          <TagPill label={article.frontmatter.kind === "blog" ? "Article" : "Veille"} />
          {tags.map((tag) => (
            <TagPill key={tag} label={tag} />
          ))}
        </div>
        <h1 className="text-article-title font-display tracking-tight text-fg md:text-article-title-lg">
          <Link
            to={`/article/${article.date}`}
            className="transition-colors duration-base ease-standard hover:text-primary"
          >
            {article.frontmatter.title}
          </Link>
        </h1>
        <div className="mt-lg flex items-center gap-md border-b border-border-subtle pb-8">
          <img src={AUTHOR_AVATAR_URL} alt="" className="size-12 shrink-0 rounded-full object-cover" />
          <div>
            <p className="font-bold text-fg">Aurélien Allienne</p>
            <p className="text-sm text-fg-muted">Publié le {formatDateLong(article.date)}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

// History (`/history`, "Articles") — featured newest entry + the rest as a grid, mirroring the
// Astro site's index page (FR-3).
export default function History(): JSX.Element {
  const state = useAsync(() => listRecentArticles(30), []);

  if (state.status === "loading")
    return (
      <Container width="listing">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </Container>
    );
  if (state.status === "error")
    return (
      <Container>
        <ErrorBanner message="Impossible de charger l'historique. Réessayez." />
      </Container>
    );
  if (state.data.length === 0)
    return (
      <Container>
        <EmptyState title="Aucun article pour l'instant" />
      </Container>
    );

  const [featured, ...rest] = state.data;
  // Astro falls back to the full list when there is only one entry, so the grid is never empty.
  const grid = rest.length > 0 ? rest : state.data;

  return (
    <>
      {featured ? <FeaturedArticle article={featured} /> : null}
      <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-16">
        <div className="mb-10 flex items-center justify-between border-b border-border-subtle pb-6">
          <h2 className="text-2xl font-bold tracking-tight text-fg md:text-3xl">
            Dernières Analyses
          </h2>
        </div>
        <section aria-label="Liste des articles">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
            {grid.map((article) => (
              <ArticleCard key={article.date} article={article} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
