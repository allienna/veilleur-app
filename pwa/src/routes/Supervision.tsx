import { Link } from "react-router-dom";

import { Container } from "@/components/Container";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NotificationOptIn } from "@/components/NotificationOptIn";
import { StatusPill } from "@/components/StatusPill";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

  // The opt-in control sits in the header so it is reachable in every state — including before the
  // first run (empty) and during load — not only once a run history exists.
  let body: JSX.Element;
  if (state.status === "loading")
    // Plain blocks, not `SkeletonCard`: that one is shaped like an article tile (16/9 image).
    body = (
      <div className="grid gap-sm">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  else if (state.status === "error")
    body = <ErrorBanner message="Impossible de charger l'historique des runs. Réessayez." />;
  else if (state.data.length === 0)
    body = (
      <EmptyState
        title="Aucun run pour l'instant"
        subline="L'historique apparaîtra ici après le premier run."
      />
    );
  else
    body = (
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
    );

  return (
    <Container width="supervision">
      <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
        <h1 className="text-h1 font-display text-fg">Supervision</h1>
        <NotificationOptIn />
      </div>
      {body}
    </Container>
  );
}
