import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { AppFooter } from "@/components/AppFooter";
import { AppHeader } from "@/components/AppHeader";
import { Container } from "@/components/Container";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useOnline } from "@/lib/useOnline";

// `AppShell` — outer layout (header + main + footer). DESIGN §2/§3.
// Surfaces the offline banner when the network drops; the SW serves last-known data.
//
// `main` is deliberately unconstrained (`flex-1 w-full`, no padding), mirroring the Astro site:
// each route picks its own width via `Container`, which is what lets an article hero span the full
// viewport and the listing grid reach 1152px. The flex column keeps the footer at the bottom on
// short pages, and the bottom safe-area inset now lives on `AppFooter`.
export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const online = useOnline();
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <AppHeader />
      <main className="w-full flex-1">
        {!online ? (
          <Container className="pb-0">
            <ErrorBanner
              variant="info"
              message="Mode hors ligne — les données peuvent ne pas être à jour."
              // Banner sits above the routed content; never auto-dismisses (DESIGN §4).
            />
          </Container>
        ) : null}
        {children}
      </main>
      <AppFooter />
      <Toaster position="top-center" richColors />
    </div>
  );
}
