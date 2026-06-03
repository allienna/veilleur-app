import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** True when the user asked the OS to reduce motion (DESIGN §a11y — required, not optional). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name for the dialog; also rendered as the sheet heading. */
  title: string;
  children: ReactNode;
}

// `Sheet` — hand-rolled iOS-style bottom sheet (DESIGN §3; `shadow.lg`, `radius.xl` top edge).
// No Radix: the `ui/` inventory is hand-rolled with `cn` + tokens; we replicate the modal
// a11y we need (role=dialog, aria-modal, focus capture/restore, Escape + overlay dismiss).
export function Sheet({ open, onOpenChange, title, children }: SheetProps): JSX.Element | null {
  const reducedMotion = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  // Drives the slide-in: false on mount → true after paint so the panel transitions up.
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    setEntered(true);
    panelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      setEntered(false);
      restoreFocusTo.current?.focus();
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  // Under reduced motion the panel is present in place (no transition class to assert against).
  const settled = entered || reducedMotion;
  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={() => onOpenChange(false)}
        className={cn(
          "absolute inset-0 bg-black/40",
          !reducedMotion && "transition-opacity duration-base ease-standard",
          settled ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-0 bottom-0 rounded-t-xl bg-bg-elevated shadow-lg outline-none",
          "px-md pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-md",
          !reducedMotion && "transition-transform duration-base ease-standard",
          settled ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mb-md flex items-center justify-between">
          <h2 className="text-h3 font-display text-fg">{title}</h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => onOpenChange(false)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-fg-muted hover:bg-border-subtle"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
