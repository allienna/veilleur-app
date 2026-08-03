import { useParams } from "react-router-dom";

import { ArticleView } from "@/components/ArticleView";
import { Container } from "@/components/Container";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SkeletonCard } from "@/components/SkeletonCard";
import { getArticle } from "@/data/articles";
import { useAsync } from "@/lib/useAsync";

// Article (`/article/:date`) — full reader for any historical article (FR-3).
// `ArticleView` brings its own width (its hero is full-bleed), so only the other states need a
// `Container` — `AppShell`'s `main` is unconstrained.
export default function Article(): JSX.Element {
  const { date = "" } = useParams();
  const state = useAsync(() => getArticle(date), [date]);

  if (state.status === "loading")
    return (
      <Container>
        <SkeletonCard />
      </Container>
    );
  if (state.status === "error")
    return (
      <Container>
        <ErrorBanner message="Impossible de charger l'article. Réessayez." />
      </Container>
    );
  if (!state.data)
    return (
      <Container>
        <EmptyState title="Article introuvable" />
      </Container>
    );
  return <ArticleView article={state.data} />;
}
