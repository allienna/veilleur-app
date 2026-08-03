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
      {/* The owl mascot, as on the Astro site's empty listing — at DESIGN §4's 30% opacity. */}
      <p aria-hidden className="text-6xl opacity-30">
        🦉
      </p>
      {/* Work Sans, not `font.display`: the Astro empty state is a plain `p` (`text-xl
          font-semibold`), and only headings take the display face. */}
      <p className="text-xl font-semibold text-fg">{title}</p>
      {subline ? <p className="max-w-reading text-sm text-fg-muted">{subline}</p> : null}
      {action}
    </div>
  );
}
