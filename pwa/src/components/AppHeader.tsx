import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

// `AppHeader` — sticky top chrome (DESIGN §2/§3): mascot, "Le Veilleur", three nav targets.
// No bottom tab bar (visual lineage with the Astro header-only chrome). Safe-area aware.
const NAV = [
  { to: "/", label: "Aujourd'hui", end: true },
  { to: "/history", label: "Articles", end: false },
  { to: "/supervision", label: "Supervision", end: false },
];

export function AppHeader(): JSX.Element {
  return (
    // `z-50` (the Astro header's value): the article card is `z-10`, and at an equal z-index in
    // the same stacking context DOM order wins — the card would paint over the sticky header.
    <header className="sticky top-0 z-50 bg-bg-inverted text-fg-inverted shadow-md [padding-top:env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-md gap-y-xs px-4 py-sm md:px-20">
        <span className="flex shrink-0 items-center gap-sm">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-base"
          >
            🦉
          </span>
          {/* `translate="no"`: a proper noun. Browser auto-translation renders it "The Watchman". */}
          <span
            translate="no"
            // No `font-display`: the Astro wordmark is a plain `span`, so it inherits the body face
            // (Work Sans). `font.display` is for headings only.
            className="whitespace-nowrap text-xl font-black uppercase tracking-tighter"
          >
            Le Veilleur
          </span>
        </span>
        <nav aria-label="Navigation principale" className="ml-auto flex gap-xs">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "inline-flex min-h-[44px] items-center whitespace-nowrap rounded-md px-sm text-sm font-medium",
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
