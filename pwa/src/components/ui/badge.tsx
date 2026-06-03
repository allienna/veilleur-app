import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// `Badge` — base for TagPill and (later, F-011) StatusPill (DESIGN §2; radius.sm).
const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-sm py-[2px] text-caption font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-border-subtle text-fg-muted",
        primary: "bg-primary/15 text-navy",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
