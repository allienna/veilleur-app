import { useParams } from "react-router-dom";

import { Container } from "@/components/Container";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { RunTimeline } from "@/components/RunTimeline";
import { Skeleton } from "@/components/ui/skeleton";
import { useRun } from "@/lib/useRun";

// Live run view (`/runs/:date`) — the real-time timeline for one run (FR-D1). `date` is the
// Firestore document key. Wider supervision container (DESIGN §3). Missing run → EmptyState;
// listener error → ErrorBanner.
export default function Run(): JSX.Element {
  const { date = "" } = useParams<{ date: string }>();
  const { run, loading, error } = useRun(date);

  return (
    <Container width="supervision">
      {error ? (
        <ErrorBanner message="Impossible de suivre ce run. Réessayez." />
      ) : loading ? (
        // A plain block, not `SkeletonCard`: that one is shaped like an article tile (16/9 image).
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : run ? (
        <RunTimeline run={run} />
      ) : (
        <EmptyState title="Aucun run pour cette date" subline={date} />
      )}
    </Container>
  );
}
