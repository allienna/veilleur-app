import { useParams } from "react-router-dom";

import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { RunTimeline } from "@/components/RunTimeline";
import { SkeletonCard } from "@/components/SkeletonCard";
import { useRun } from "@/lib/useRun";

// Live run view (`/runs/:date`) — the real-time timeline for one run (FR-D1). `date` is the
// Firestore document key. Wider supervision container (DESIGN §3). Missing run → EmptyState;
// listener error → ErrorBanner.
export default function Run(): JSX.Element {
  const { date = "" } = useParams<{ date: string }>();
  const { run, loading, error } = useRun(date);

  return (
    <div className="mx-auto max-w-5xl">
      {error ? (
        <ErrorBanner message="Impossible de suivre ce run. Réessayez." />
      ) : loading ? (
        <SkeletonCard />
      ) : run ? (
        <RunTimeline run={run} />
      ) : (
        <EmptyState title="Aucun run pour cette date" subline={date} />
      )}
    </div>
  );
}
