import { Link } from "react-router-dom";

import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SkeletonCard } from "@/components/SkeletonCard";
import { StatusPill } from "@/components/StatusPill";
import { Card, CardContent } from "@/components/ui/card";
import { listRecentRuns } from "@/data/runs";
import { formatDateShort, formatDuration } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";

/** "$0.42" / "—" — the run's LLM cost (USD, the Minion's native unit; null before generation). */
function formatCost(costUsd?: number | null): string {
  return costUsd == null ? "—" : `$${costUsd.toFixed(2)}`;
}

// Supervision (`/supervision`) — run history, newest first (FR-D2; ≥7, up to 30). Compact density,
// wider supervision container (DESIGN §3). Each row links to the live/detail view at `/runs/:date`.
export default function Supervision(): JSX.Element {
  const state = useAsync(() => listRecentRuns(30), []);

  if (state.status === "loading")
    return (
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-md">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  if (state.status === "error")
    return <ErrorBanner message="Impossible de charger l'historique des runs. Réessayez." />;
  if (state.data.length === 0)
    return <EmptyState title="Aucun run pour l'instant" subline="L'historique apparaîtra ici après le premier run." />;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-lg text-h1 font-display text-fg">Supervision</h1>
      <ul className="grid gap-sm">
        {state.data.map((run) => (
          <li key={run.date}>
            <Link
              to={`/runs/${run.date}`}
              className="block transition-transform duration-fast ease-standard active:scale-[0.98]"
            >
              <Card>
                <CardContent className="flex items-center justify-between gap-md py-md">
                  <span className="flex items-center gap-md">
                    <StatusPill status={run.status} />
                    <span className="text-body text-fg">{formatDateShort(run.date)}</span>
                  </span>
                  <span className="flex items-center gap-md text-caption text-fg-muted tabular-nums">
                    <span>{formatDuration(run.startedAt, run.endedAt)}</span>
                    <span>{formatCost(run.costUsd)}</span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
