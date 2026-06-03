import type { RunStatus } from "@veilleur/shared/run";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_DOT, STATUS_TEXT, STATUS_VERB } from "@/lib/runStatus";

// `StatusPill` — run-status badge (DESIGN §2). Dual-encoded per DESIGN §accessibility: the
// `color.status.*` colour is always paired with the French status verb, never colour alone.
export function StatusPill({
  status,
  className,
}: {
  status: RunStatus;
  className?: string;
}): JSX.Element {
  return (
    <Badge className={cn("gap-xs", STATUS_TEXT[status], className)}>
      <span aria-hidden className={cn("size-2 rounded-full", STATUS_DOT[status])} />
      {STATUS_VERB[status]}
    </Badge>
  );
}
