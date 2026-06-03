import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// `Card` — base surface for ArticleCard, sign-in, etc. (DESIGN §2; radius.lg, shadow.sm).
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-lg border border-border-subtle bg-bg-elevated shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn("p-lg", className)} {...props} />;
}
