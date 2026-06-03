import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// `Skeleton` — loading placeholder primitive (DESIGN §4 Loading: never a spinner).
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-border-subtle", className)}
      {...props}
    />
  );
}
