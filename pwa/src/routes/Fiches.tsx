import { useSearchParams } from "react-router-dom";

import { Container } from "@/components/Container";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FicheCard } from "@/components/FicheCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import { listFichesForArticle } from "@/data/fiches";
import { useAsync } from "@/lib/useAsync";

// Fiches (`/fiches?article=<date>`) — the source-analysis grid behind an article's "Consulter
// toutes les analyses de cet article" CTA. The legacy Astro `/fiches` index renders every fiche
// and filters `?article=` client-side after the fact; this queries Firestore for exactly the
// cited article's fiches instead, so nothing downloads before it's needed and no other article's
// analyses ever appear here. There is no unfiltered "browse all fiches" entry point — the only
// way into this route is the CTA, which always carries `?article=`.
export default function Fiches(): JSX.Element {
  const [params] = useSearchParams();
  const article = params.get("article") ?? "";
  const state = useAsync(() => listFichesForArticle(article), [article], Boolean(article));

  if (!article)
    return (
      <Container width="listing">
        <EmptyState title="Aucun article sélectionné" />
      </Container>
    );
  if (state.status === "loading")
    return (
      <Container width="listing">
        <div className="grid grid-cols-1 gap-lg md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </Container>
    );
  if (state.status === "error")
    return (
      <Container width="listing">
        <ErrorBanner message="Impossible de charger les analyses. Réessayez." />
      </Container>
    );
  if (state.data.length === 0)
    return (
      <Container width="listing">
        <EmptyState
          title="Aucune analyse disponible"
          subline="Les analyses de cet article n'ont pas pu être générées."
        />
      </Container>
    );

  return (
    <Container width="listing">
      <h1 className="mb-lg text-h1 font-display text-fg">Analyses des sources</h1>
      <div className="grid grid-cols-1 gap-lg md:grid-cols-2 lg:grid-cols-3">
        {state.data.map((fiche) => (
          <FicheCard key={fiche.slug} fiche={fiche} />
        ))}
      </div>
    </Container>
  );
}
