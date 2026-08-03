import { PUBLIC_SITE_URL } from "@/config";

// Secondary nav — these pages exist only on the public Astro site, so every link leaves the PWA.
const LINKS = [
  { href: `${PUBLIC_SITE_URL}/confidentialite`, label: "Confidentialité" },
  { href: `${PUBLIC_SITE_URL}/mentions-legales`, label: "Mentions Légales" },
  { href: `${PUBLIC_SITE_URL}/newsletter`, label: "Newsletter" },
  { href: `${PUBLIC_SITE_URL}/contact`, label: "Contact" },
];

// `AppFooter` — replica of ../veilleur/site's BaseLayout footer (DESIGN §2/§3). Carries the bottom
// safe-area inset, since it is now the last thing on the page instead of `main`.
export function AppFooter(): JSX.Element {
  return (
    <footer className="bg-bg-inverted px-4 py-6 text-fg-inverted/70 [padding-bottom:calc(env(safe-area-inset-bottom)+1.5rem)] md:px-20">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
        <a
          href={PUBLIC_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-md transition-opacity duration-base ease-standard hover:opacity-90"
        >
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-base"
          >
            🦉
          </span>
          {/* `translate="no"`: a proper noun — see AppHeader. */}
          <span
            translate="no"
            className="text-sm font-bold uppercase tracking-widest text-fg-inverted"
          >
            Le Veilleur
          </span>
        </a>

        <nav aria-label="Navigation secondaire" className="flex flex-wrap items-center justify-center gap-6 text-sm">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center transition-colors duration-base ease-standard hover:text-fg-inverted"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href={`${PUBLIC_SITE_URL}/rss.xml`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Flux RSS"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fg-inverted/10 transition-colors duration-base ease-standard hover:bg-fg-inverted/20"
        >
          <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="6.18" cy="17.82" r="2.18" />
            <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
