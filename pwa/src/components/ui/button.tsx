import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// `Button` — all tap affordances (DESIGN §2). 44×44pt floor (DESIGN §5 touch targets).
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-sm rounded-md text-caption font-body font-medium transition-colors duration-fast ease-standard focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 min-h-[44px] min-w-[44px] px-md",
  {
    variants: {
      variant: {
        primary: "bg-primary text-bg-inverted hover:opacity-90 active:scale-[0.98]",
        secondary: "bg-bg-elevated text-fg border border-border-strong hover:bg-border-subtle",
        ghost: "bg-transparent text-fg hover:bg-border-subtle",
        destructive: "bg-error text-white hover:opacity-90 active:scale-[0.98]",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, type = "button", ...props }: ButtonProps): JSX.Element {
  return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />;
}
