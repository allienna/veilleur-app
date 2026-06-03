import type { RunStatus } from "@veilleur/shared/run";

// Single source of the run-status presentation (DESIGN §1 run-status tokens + §accessibility:
// status is never colour-only). `verb` is the French status word shown alongside the colour, and
// `dot` is the Tailwind background utility for the status dot (the `color.status.*` tokens).
export const STATUS_VERB: Record<RunStatus, string> = {
  success: "succès",
  success_with_warnings: "avec avertissements",
  failure: "échec",
  skipped: "ignoré",
  aborted: "interrompu",
  running: "en cours",
};

export const STATUS_DOT: Record<RunStatus, string> = {
  success: "bg-status-success",
  success_with_warnings: "bg-status-warning",
  failure: "bg-status-error",
  skipped: "bg-status-neutral",
  aborted: "bg-status-muted",
  running: "bg-status-live",
};

// Text colour matched to each status, for the pill label.
export const STATUS_TEXT: Record<RunStatus, string> = {
  success: "text-status-success",
  success_with_warnings: "text-status-warning",
  failure: "text-status-error",
  skipped: "text-status-neutral",
  aborted: "text-status-muted",
  running: "text-status-live",
};
