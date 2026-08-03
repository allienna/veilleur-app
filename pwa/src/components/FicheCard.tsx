import type { Fiche } from "@veilleur/shared/fiche";
import { Link } from "react-router-dom";

import { TagPill } from "@/components/TagPill";
import { splitFicheBody } from "@/lib/ficheBody";

// Per-theme thumbnail gradient, ported from ../veilleur/site's FicheCard.astro. Stock Tailwind
// palette classes, not project tokens: this 4-way accent gradient has no equivalent in DESIGN §1
// and is a narrow, self-contained visual flourish rather than a reusable surface color.
const THEME_GRADIENTS: Record<string, string> = {
  IA: "from-amber-100 to-orange-200",
  Sécurité: "from-red-100 to-rose-200",
  Leadership: "from-blue-100 to-indigo-200",
  Tech: "from-emerald-100 to-teal-200",
};
const DEFAULT_GRADIENT = "from-slate-100 to-slate-200";

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

// `FicheCard` — one source-analysis tile in the `/fiches` grid, ported from FicheCard.astro
// (DESIGN §2). The résumé section stands in for the Astro card's `summary` prop — the shared
// `Fiche` schema has no separate excerpt field, only the full markdown `body`.
export function FicheCard({ fiche }: { fiche: Fiche }): JSX.Element {
  const domain = domainOf(fiche.url);
  const { summary } = splitFicheBody(fiche.body);
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-sm transition-shadow duration-base ease-standard hover:shadow-md">
      <div
        className={`flex aspect-[2/1] w-full items-center justify-center bg-gradient-to-br ${THEME_GRADIENTS[fiche.theme] ?? DEFAULT_GRADIENT}`}
      >
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          loading="lazy"
          width={40}
          height={40}
          className="size-10 rounded-lg shadow-sm opacity-80 transition-all duration-base ease-standard group-hover:scale-110 group-hover:opacity-100"
        />
      </div>
      <div className="flex flex-1 flex-col p-lg">
        <div className="mb-sm flex items-center gap-sm">
          <TagPill label={fiche.theme} />
          {domain ? <span className="text-xs text-fg-muted">{domain}</span> : null}
        </div>
        <h2 className="mb-sm line-clamp-2 text-lg font-bold leading-snug text-fg transition-colors duration-base ease-standard group-hover:text-primary">
          <Link
            to={`/fiches/${fiche.slug}`}
            className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {fiche.title}
          </Link>
        </h2>
        <p className="mb-md line-clamp-3 flex-1 text-sm leading-relaxed text-fg-muted">
          {summary}
        </p>
        <Link
          to={`/fiches/${fiche.slug}`}
          className="inline-flex min-h-[44px] items-center gap-xs self-start rounded-full border border-primary/30 px-md text-sm font-semibold text-primary transition-colors duration-base ease-standard hover:bg-primary hover:text-bg-inverted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Lire l'analyse complète →
        </Link>
      </div>
    </article>
  );
}
