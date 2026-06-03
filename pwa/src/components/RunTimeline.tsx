import type { Run } from "@veilleur/shared/run";

import { ErrorBanner } from "@/components/ErrorBanner";
import { RunStepRow } from "@/components/RunStepRow";
import { StatusPill } from "@/components/StatusPill";
import { Card, CardContent } from "@/components/ui/card";
import { STEP_ORDER } from "@/data/runs";

// `RunTimeline` — the live ordered list of the nine Minion steps with status + duration
// (DESIGN §2). Always renders all nine in canonical order; steps the run hasn't reached yet are
// pending. The run-level status is shown as a `StatusPill`; a run-level error surfaces in an
// `ErrorBanner` above the list (a failed step's own error rides its row's status).
export function RunTimeline({ run }: { run: Run }): JSX.Element {
  const byName = new Map(run.steps.map((s) => [s.name, s]));

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-display text-fg">Déroulé du run</h2>
        <StatusPill status={run.status} />
      </div>
      {run.error ? <ErrorBanner message={run.error} /> : null}
      <Card>
        <CardContent className="py-sm">
          <ol className="divide-y divide-border-subtle">
            {STEP_ORDER.map((name) => (
              <RunStepRow key={name} name={name} step={byName.get(name)} />
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
