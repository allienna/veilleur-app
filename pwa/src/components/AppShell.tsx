import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useOnline } from "@/lib/useOnline";

// `AppShell` — outer layout (header + main + safe-area paddings). DESIGN §2/§3.
// Surfaces the offline banner when the network drops; the SW serves last-known data.
export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const online = useOnline();
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <AppHeader />
      <main className="mx-auto max-w-reading px-md py-lg [padding-bottom:calc(env(safe-area-inset-bottom)+1.5rem)] sm:px-lg">
        {!online ? (
          <ErrorBanner
            variant="info"
            message="Mode hors ligne — les données peuvent ne pas être à jour."
            // Banner sits above the routed content; never auto-dismisses (DESIGN §4).
          />
        ) : null}
        <div className={online ? undefined : "mt-md"}>{children}</div>
      </main>
      <Toaster position="top-center" richColors />
    </div>
  );
}
