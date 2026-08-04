import { Link } from "react-router-dom";

import { Container } from "@/components/Container";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NotificationOptIn } from "@/components/NotificationOptIn";
import { StatusPill } from "@/components/StatusPill";
import { TrendStat } from "@/components/TrendStat";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listRecentRuns } from "@/data/runs";
import { formatDateShort, formatDuration } from "@/lib/format";
import { FAILURE_BUCKET_LABEL } from "@/lib/runErrors";
import { computeTrends, topFailureBucket, type Trends } from "@/lib/trends";
import { useAsync } from "@/lib/useAsync";

/** "$0.42" / "—" — the run's LLM cost (USD, the Minion's native unit; null before generation). */
function formatCost(costUsd?: number | null): string {
  return costUsd == null ? "—" : `$${costUsd.toFixed(2)}`;
}

const TRENDS_WINDOW_DAYS = 21;

// F-016 FR-1 — rolling-window trends above the history list. Reuses the same `listRecentRuns`
// fetch as the list (no second Firestore query); `EmptyState` when there's no eligible run yet,
// never a zero-filled bar (DESIGN §4, updated 2026-08-04).
function TrendsSection({ trends }: { trends: Trends }): JSX.Element {
  if (trends.eligibleCount === 0) {
    return (
      <EmptyState
        title="Pas encore de tendance"
        subline="Apparaîtra après le premier run compté (hors ignoré/interrompu)."
      />
    );
  }
  const top = topFailureBucket(trends.failureBreakdown);
  return (
    <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
      <TrendStat
        label={`Taux de succès (${TRENDS_WINDOW_DAYS}j)`}
        value={`${Math.round((trends.successRate ?? 0) * 100)}%`}
        fraction={trends.successRate ?? 0}
        tone={
          (trends.successRate ?? 0) >= 0.9
            ? "success"
            : (trends.successRate ?? 0) >= 0.5
              ? "warning"
              : "error"
        }
      />
      <TrendStat
        label="Coût moyen / run"
        value={formatCost(trends.averageCostUsd)}
        fraction={0}
        tone="neutral"
      />
      <TrendStat
        label="Cause d'échec principale"
        value={top ? FAILURE_BUCKET_LABEL[top] : "Aucune"}
        fraction={top ? trends.failureBreakdown[top] / trends.eligibleCount : 0}
        tone={top ? "warning" : "success"}
      />
    </div>
  );
}

// Supervision (`/supervision`) — run history, newest first (FR-D2; ≥7, up to 30). Compact density,
// wider supervision container (DESIGN §3). Each row links to the live/detail view at `/runs/:date`.
export default function Supervision(): JSX.Element {
  const state = useAsync(() => listRecentRuns(30), []);

  // The opt-in control sits in the header so it is reachable in every state — including before the
  // first run (empty) and during load — not only once a run history exists.
  let trendsBody: JSX.Element;
  let body: JSX.Element;
  if (state.status === "loading") {
    trendsBody = (
      <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
    // Plain blocks, not `SkeletonCard`: that one is shaped like an article tile (16/9 image).
    body = (
      <div className="grid gap-sm">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  } else if (state.status === "error") {
    trendsBody = <ErrorBanner message="Impossible de calculer les tendances." />;
    body = <ErrorBanner message="Impossible de charger l'historique des runs. Réessayez." />;
  } else {
    trendsBody = <TrendsSection trends={computeTrends(state.data)} />;
    body =
      state.data.length === 0 ? (
        <EmptyState
          title="Aucun run pour l'instant"
          subline="L'historique apparaîtra ici après le premier run."
        />
      ) : (
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
  }

  return (
    <Container width="supervision">
      <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
        <h1 className="text-h1 font-display text-fg">Supervision</h1>
        <NotificationOptIn />
      </div>
      <div className="mb-lg flex flex-col gap-sm">
        <h2 className="text-h2 font-display text-fg">Tendances</h2>
        {trendsBody}
      </div>
      {body}
    </Container>
  );
}
