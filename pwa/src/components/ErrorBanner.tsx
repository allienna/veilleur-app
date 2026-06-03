import type { ReactNode } from "react";

import { Alert } from "@/components/ui/alert";

// `ErrorBanner` — top-of-view strip for run failure / offline / boundary (DESIGN §4).
// Never auto-dismisses; recovery is always an affordance.
export function ErrorBanner({
  message,
  variant = "error",
  action,
}: {
  message: string;
  variant?: "error" | "info";
  action?: ReactNode;
}): JSX.Element {
  return (
    <Alert variant={variant} className="items-center justify-between">
      <span>{message}</span>
      {action}
    </Alert>
  );
}
