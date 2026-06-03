import type { RunStep, StepName } from "@veilleur/shared/run";

import { formatDuration } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { STATUS_DOT } from "@/lib/runStatus";
import { cn } from "@/lib/utils";

// Human labels for the nine pipeline steps (DESIGN §3 supervision; fr-FR per §5).
const STEP_LABEL: Record<StepName, string> = {
  gmail: "Gmail",
  jina: "Extraction (Jina)",
  validate_input: "Validation des sources",
  assemble: "Assemblage du contexte",
  generate: "Génération",
  validate_output: "Validation de l'article",
  imagen: "Image (Imagen)",
  github: "Publication GitHub",
  publish: "Mise en ligne",
};

// `RunStepRow` — one timeline row: step name + status dot + duration (DESIGN §2). A step absent
// from the run's subcollection is *pending* (neutral dot, no duration). The `running` step pulses
// (`color.status.live`); the pulse is gated by `motion-safe` so it is a static dot under
// `prefers-reduced-motion` (DESIGN §1 Motion). Its duration ticks live via `useNow`.
export function RunStepRow({ name, step }: { name: StepName; step?: RunStep }): JSX.Element {
  const isRunning = step?.status === "running";
  const now = useNow(isRunning);
  const status = step?.status ?? "skipped"; // absent → pending, rendered with the neutral token
  const pending = step === undefined;

  return (
    <li className="flex items-center justify-between py-sm">
      <span className="flex items-center gap-sm">
        <span
          aria-hidden
          className={cn(
            "size-2.5 rounded-full",
            pending ? "bg-status-neutral opacity-40" : STATUS_DOT[status],
            isRunning && "motion-safe:animate-pulse",
          )}
        />
        <span className={cn("text-body", pending ? "text-fg-muted" : "text-fg")}>
          {STEP_LABEL[name]}
        </span>
      </span>
      <span className="text-caption text-fg-muted tabular-nums">
        {pending ? "—" : formatDuration(step?.startedAt, step?.endedAt, isRunning ? now : undefined)}
      </span>
    </li>
  );
}
