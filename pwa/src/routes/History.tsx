import { ArticleCard } from "@/components/ArticleCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SkeletonCard } from "@/components/SkeletonCard";
import { listRecentArticles } from "@/data/articles";
import { useAsync } from "@/lib/useAsync";

// History (`/history`) — the last ~30 articles, newest first (FR-3). Compact density.
export default function History(): JSX.Element {
  const state = useAsync(() => listRecentArticles(30), []);

  if (state.status === "loading")
    return (
      <div className="grid gap-md sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  if (state.status === "error")
    return <ErrorBanner message="Impossible de charger l'historique. Réessayez." />;
  if (state.data.length === 0)
    return <EmptyState title="Aucun article pour l'instant" />;

  return (
    <>
      <h1 className="mb-lg text-h1 font-display text-fg">Historique</h1>
      <div className="grid gap-md sm:grid-cols-2">
        {state.data.map((article) => (
          <ArticleCard key={article.date} article={article} />
        ))}
      </div>
    </>
  );
}
