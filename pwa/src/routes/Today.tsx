import { ArticleView } from "@/components/ArticleView";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SkeletonCard } from "@/components/SkeletonCard";
import { getArticle } from "@/data/articles";
import { todayParis } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";

// Today (`/`) — today's article, the primary reading surface (FR-3). Regular density.
export default function Today(): JSX.Element {
  const date = todayParis();
  const state = useAsync(() => getArticle(date), [date]);

  if (state.status === "loading") return <SkeletonCard />;
  if (state.status === "error")
    return <ErrorBanner message="Impossible de charger l'article. Réessayez." />;
  if (!state.data)
    return (
      <EmptyState
        title="Pas d'article aujourd'hui"
        subline="Le run quotidien n'a pas encore produit d'article, ou aucune source n'était disponible."
      />
    );
  return <ArticleView article={state.data} />;
}
