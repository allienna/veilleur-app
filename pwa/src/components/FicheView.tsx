import type { Fiche } from "@veilleur/shared/fiche";
import { ChevronRight, Home } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Link } from "react-router-dom";

import { Container } from "@/components/Container";
import { formatDateLong } from "@/lib/format";
import { splitFicheBody } from "@/lib/ficheBody";

// Fiche prose (Résumé / Analyse approfondie / Pourquoi ça compte) reads at body scale, not the
// article reader's editorial scale — the legacy layout sets it in `text-sm`/`text-slate-700`.
const PROSE_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-sm text-sm leading-relaxed text-fg-body">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline decoration-primary/30 hover:decoration-primary"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
};

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

// One `<dt>`/`<dd>` metadata cell; omitted entirely when there's nothing to show (Astro renders
// each cell conditionally too).
function MetaCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="border-b border-r border-border-subtle px-md py-sm last:border-r-0 md:border-b-0">
      <dt className="mb-xs text-xs font-bold uppercase tracking-wider text-primary">{label}</dt>
      <dd className="text-sm text-fg">{value}</dd>
    </div>
  );
}

// `FicheView` — full fiche reader, ported from ../veilleur/site's FicheLayout.astro (DESIGN §2).
// Breadcrumb back to the citing article, header with the original-source pill + Google Translate
// link + metadata grid, Résumé, a "Pourquoi ça compte" callout, then Analyse approfondie next to
// a Points clés card.
export function FicheView({ fiche }: { fiche: Fiche }): JSX.Element {
  const domain = domainOf(fiche.url);
  const { summary, keyPoints, analysis, whyItMatters } = splitFicheBody(fiche.body);
  const parentDate = fiche.used_in[0];
  const googleTranslateUrl = `https://translate.google.com/translate?sl=auto&tl=fr&u=${encodeURIComponent(fiche.url)}`;

  return (
    <Container>
      {parentDate ? (
        <nav aria-label="Fil d'Ariane" className="mb-xl flex items-center gap-xs text-sm">
          <Link to="/" className="text-fg-muted hover:text-primary" aria-label="Accueil">
            <Home className="size-4" aria-hidden="true" />
          </Link>
          <ChevronRight className="size-4 text-border-strong" aria-hidden="true" />
          <Link to={`/article/${parentDate}`} className="text-fg-muted hover:text-primary">
            Article du {formatDateLong(parentDate)}
          </Link>
          <ChevronRight className="size-4 text-border-strong" aria-hidden="true" />
          <Link to={`/fiches?article=${parentDate}`} className="text-fg-muted hover:text-primary">
            Analyses
          </Link>
          <ChevronRight className="size-4 text-border-strong" aria-hidden="true" />
          <span className="truncate font-medium text-fg">{fiche.title}</span>
        </nav>
      ) : (
        <Link
          to="/fiches"
          className="mb-xl inline-flex items-center gap-xs text-sm text-fg-muted hover:text-primary"
        >
          ← Toutes les analyses
        </Link>
      )}

      <header className="mb-2xl">
        <h1 className="mb-md text-article-title font-display tracking-tight text-fg md:text-article-title-lg">
          {fiche.title}
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-x-md gap-y-sm">
          <a
            href={fiche.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-bg-inverted hover:bg-primary/90"
          >
            Article original : {domain}
          </a>
          <a
            href={googleTranslateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-xs rounded text-sm text-fg-muted hover:text-primary"
          >
            Lire en 🇫🇷 via Google Translate
          </a>
        </div>

        <dl className="mt-lg grid grid-cols-2 divide-x divide-border-subtle rounded-lg border border-border-subtle md:grid-cols-3">
          <MetaCell label="Thème" value={fiche.theme} />
          {fiche.keywords.length > 0 ? (
            <MetaCell label="Mots-clés" value={fiche.keywords.join(", ")} />
          ) : null}
          {fiche.tone ? <MetaCell label="Ton" value={fiche.tone} /> : null}
        </dl>
      </header>

      {summary ? (
        <section className="mb-2xl">
          <h2 className="mb-xs text-2xl font-black tracking-tight text-fg">Résumé</h2>
          <div className="mb-lg h-1 w-16 rounded-full bg-primary" />
          <ReactMarkdown components={PROSE_COMPONENTS}>{summary}</ReactMarkdown>
        </section>
      ) : null}

      {whyItMatters ? (
        <section className="mb-2xl rounded-r-lg border-l-4 border-primary bg-primary/10 px-lg py-md">
          <h2 className="mb-sm flex items-center gap-xs text-sm font-black uppercase tracking-wider text-fg">
            💡 Pourquoi ça compte
          </h2>
          <ReactMarkdown
            components={{
              ...PROSE_COMPONENTS,
              p: ({ children }) => (
                <p className="mb-0 text-sm italic leading-relaxed text-fg-body">{children}</p>
              ),
            }}
          >
            {whyItMatters}
          </ReactMarkdown>
        </section>
      ) : null}

      <div className="mb-2xl grid grid-cols-1 gap-xl lg:grid-cols-5">
        {analysis ? (
          <div className="lg:col-span-3">
            <h2 className="mb-xs text-2xl font-black tracking-tight text-fg">
              Analyse approfondie
            </h2>
            <div className="mb-lg h-1 w-16 rounded-full bg-primary" />
            <ReactMarkdown components={PROSE_COMPONENTS}>{analysis}</ReactMarkdown>
          </div>
        ) : null}
        {keyPoints.length > 0 ? (
          <aside className={analysis ? "lg:col-span-2" : "lg:col-span-5"}>
            <div className="rounded-lg border border-border-subtle p-lg">
              <h2 className="mb-md flex items-center gap-xs text-lg font-black text-fg">
                ❕ Points Clés
              </h2>
              <ul className="space-y-sm">
                {keyPoints.map((point) => (
                  <li key={point} className="flex gap-sm text-sm leading-relaxed text-fg-body">
                    <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        ) : null}
      </div>
    </Container>
  );
}
