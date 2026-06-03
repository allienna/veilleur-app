import type { ReactNode } from "react";

// `EmptyState` — text-first empty surface (DESIGN §4 Empty). Muted mascot at 30%,
// no illustrations beyond it. Optional CTA (e.g. RunNowButton, wired in F-011).
export function EmptyState({
  title,
  subline,
  action,
}: {
  title: string;
  subline?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-md py-3xl text-center">
      <div
        aria-hidden
        className="size-16 rounded-full border-2 border-primary opacity-30"
      />
      <p className="text-h3 font-display text-fg">{title}</p>
      {subline ? <p className="max-w-reading text-body text-fg-muted">{subline}</p> : null}
      {action}
    </div>
  );
}
