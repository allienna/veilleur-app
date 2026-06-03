import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// `Alert` — base for ErrorBanner (DESIGN §2 / §4 Error + Offline variants).
const alertVariants = cva("flex items-start gap-sm rounded-md border px-md py-sm text-caption", {
  variants: {
    variant: {
      error: "border-error/40 bg-error/10 text-error",
      info: "border-info/40 bg-info/10 text-info",
    },
  },
  defaultVariants: { variant: "error" },
});

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps): JSX.Element {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
