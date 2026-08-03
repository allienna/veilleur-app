import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// `Container` — per-route width + padding (DESIGN §3). `AppShell`'s `main` is deliberately
// unconstrained, mirroring the Astro site where `<main class="flex-1 w-full">` lets each page
// choose its own width: the article reader is 800px, the listing grid 1152px, and a hero image
// spans the full viewport. A single cap on `main` makes those last two impossible.
export function Container({
  width = "reading",
  className,
  children,
}: {
  /**
   * `reading` = 800px article column; `listing` = 1152px grid (Astro `max-w-6xl`);
   * `supervision` = 1024px operator views (DESIGN §3).
   */
  width?: "reading" | "listing" | "supervision";
  className?: string;
  children: ReactNode;
}): JSX.Element {
  const max =
    width === "listing" ? "max-w-6xl" : width === "supervision" ? "max-w-5xl" : "max-w-reading";
  return (
    <div className={cn("mx-auto w-full px-md py-lg sm:px-lg", max, className)}>
      {children}
    </div>
  );
}
