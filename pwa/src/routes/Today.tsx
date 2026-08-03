import { useNavigate } from "react-router-dom";

import { ArticleView } from "@/components/ArticleView";
import { Container } from "@/components/Container";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { RunNowButton } from "@/components/RunNowButton";
import { SkeletonCard } from "@/components/SkeletonCard";
import { getArticle } from "@/data/articles";
import { todayParis } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";
import { useRun } from "@/lib/useRun";

// Today (`/`) — today's article, the primary reading surface (FR-3). Regular density. When there
// is no article yet, the empty state offers a manual trigger (FR-E1); the button is disabled while
// today's run is already in progress and navigates to the live view on success.
export default function Today(): JSX.Element {
  const date = todayParis();
  const state = useAsync(() => getArticle(date), [date]);
  const navigate = useNavigate();
  // Only watch today's run when there's no article (the trigger button shows there); avoids
  // holding two Firestore listeners open on the reading view.
  const noArticle = state.status === "ready" && !state.data;
  const { run } = useRun(date, noArticle);
  const runInProgress = run?.status === "running";

  // `ArticleView` brings its own width (its hero is full-bleed); the other states need a
  // `Container`, since `AppShell`'s `main` is unconstrained.
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
        <EmptyState
          title="Pas d'article aujourd'hui"
          subline="Le run quotidien n'a pas encore produit d'article, ou aucune source n'était disponible."
          action={
            <RunNowButton
              runInProgress={runInProgress}
              onTriggered={(d) => navigate(`/runs/${d}`)}
            />
          }
        />
      </Container>
    );
  return <ArticleView article={state.data} />;
}
