import { useParams } from "react-router-dom";

import { Container } from "@/components/Container";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FicheView } from "@/components/FicheView";
import { SkeletonCard } from "@/components/SkeletonCard";
import { getFiche } from "@/data/fiches";
import { useAsync } from "@/lib/useAsync";

// Fiche (`/fiches/:slug`) — full per-source analysis reader.
export default function Fiche(): JSX.Element {
  const { slug = "" } = useParams();
  const state = useAsync(() => getFiche(slug), [slug]);

  if (state.status === "loading")
    return (
      <Container>
        <SkeletonCard />
      </Container>
    );
  if (state.status === "error")
    return (
      <Container>
        <ErrorBanner message="Impossible de charger cette analyse. Réessayez." />
      </Container>
    );
  if (!state.data)
    return (
      <Container>
        <EmptyState title="Analyse introuvable" />
      </Container>
    );
  return <FicheView fiche={state.data} />;
}
