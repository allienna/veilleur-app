import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

// `AppHeader` — sticky top chrome (DESIGN §2/§3): mascot, "Le Veilleur", three nav targets.
// No bottom tab bar (visual lineage with the Astro header-only chrome). Safe-area aware.
const NAV = [
  { to: "/", label: "Aujourd'hui", end: true },
  { to: "/history", label: "Historique", end: false },
  { to: "/supervision", label: "Supervision", end: false },
];

export function AppHeader(): JSX.Element {
  return (
    <header className="sticky top-0 z-10 bg-bg-inverted text-fg-inverted shadow-md [padding-top:env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-reading items-center gap-md px-md">
        <span aria-hidden className="size-7 rounded-full border-2 border-primary" />
        <span className="font-display text-h3 font-bold">Le Veilleur</span>
        <nav aria-label="Navigation principale" className="ml-auto flex gap-xs">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "inline-flex min-h-[44px] items-center rounded-md px-sm text-caption",
                  isActive ? "text-primary" : "text-fg-inverted/80 hover:text-fg-inverted",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
