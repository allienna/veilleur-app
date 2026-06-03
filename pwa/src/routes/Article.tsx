import { useParams } from "react-router-dom";

import { ArticleView } from "@/components/ArticleView";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SkeletonCard } from "@/components/SkeletonCard";
import { getArticle } from "@/data/articles";
import { useAsync } from "@/lib/useAsync";

// Article (`/article/:date`) — full reader for any historical article (FR-3).
export default function Article(): JSX.Element {
  const { date = "" } = useParams();
  const state = useAsync(() => getArticle(date), [date]);

  if (state.status === "loading") return <SkeletonCard />;
  if (state.status === "error")
    return <ErrorBanner message="Impossible de charger l'article. Réessayez." />;
  if (!state.data) return <EmptyState title="Article introuvable" />;
  return <ArticleView article={state.data} />;
}
