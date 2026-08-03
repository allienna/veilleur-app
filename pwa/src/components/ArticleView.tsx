import type { Article } from "@veilleur/shared/article";
import { Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

import { AUTHOR_AVATAR_URL } from "@/config";
import { ShareSheet } from "@/components/ShareSheet";
import { TagPill } from "@/components/TagPill";
import { Button } from "@/components/ui/button";
import type { ArticleLink } from "@/lib/articleBody";
import { splitArticleBody } from "@/lib/articleBody";
import { estimateReadingTime, formatDateLong } from "@/lib/format";
import { heroUrl } from "@/lib/hero";
import { cn } from "@/lib/utils";

// Verbatim from ../veilleur/site's ArticleLayout.astro — same disclaimer on both surfaces.
const AI_DISCLAIMER =
  "Cet article a été rédigé en m'appuyant sur une IA pour m'aider à synthétiser et structurer ma veille. Les idées, le choix des sources et la relecture restent les miens.";

// Markdown → the DESIGN §1 editorial scale (`text.article-*`), mirroring the Astro layout's
// `prose prose-slate` treatment with this app's tokens (no @tailwindcss/typography here).
//
// A factory, not a constant, for two reasons: the lead paragraph needs render-order state (the
// Astro side gets it free via `.article-intro > p:first-child`), and the `a` renderer needs the
// source index to turn `[[1](url)]` footnotes into anchors into the Sources list.
function markdownComponents(sourceIndexByUrl: Map<string, number>): Components {
  let paragraphs = 0;
  return {
    h1: () => null, // the frontmatter title is the h1; a body h1 would duplicate it (Astro hides it too).
    h2: ({ children }) => (
      <h2 className="mb-sm mt-xl text-article-h2 font-display tracking-tight text-fg">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-sm mt-lg text-article-h3 font-display tracking-tight text-fg">
        {children}
      </h3>
    ),
    p: ({ children }) => {
      // The lead paragraph is set apart: lighter, italic, muted (Astro's `.article-intro`).
      const isLead = paragraphs++ === 0;
      return isLead ? (
        <p className="mb-lg text-article-lead italic text-fg-muted">{children}</p>
      ) : (
        <p className="mb-md text-article-body text-fg-body">{children}</p>
      );
    },
    a: ({ href, children }) => {
      // A numeric link pointing at a known source is a footnote marker: scroll to the entry in
      // the Sources list rather than leaving the article. Astro uses a hover tooltip, which
      // neither works on touch nor is allowed by DESIGN §2.
      const index = href ? sourceIndexByUrl.get(href) : undefined;
      if (index !== undefined && typeof children === "string" && /^\d+$/.test(children)) {
        // Styled exactly like any other body link (as on the Astro site, where the marker is just
        // the numbered link): a pill with its own padding pushed the surrounding `[ ]` apart.
        return (
          <a
            href={`#source-${index}`}
            aria-label={`Source ${index}`}
            className="font-medium text-primary underline decoration-primary/30 hover:decoration-primary"
          >
            {children}
          </a>
        );
      }
      return (
        // `font-medium`: `prose` sets links to weight 500, which this hand-rolled renderer has to
        // restate (measured against the compiled Astro CSS).
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline decoration-primary/30 hover:decoration-primary"
        >
          {children}
        </a>
      );
    },
    strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
    // Markdown wraps blockquote content in a `<p>`, which the `p` renderer above would drop back
    // to `text-article-body`. The descendant variant out-specifies it; `mb-0` mirrors the Astro
    // side's `@tailwindcss/typography` override that strips blockquote paragraph margins.
    blockquote: ({ children }) => (
      <blockquote className="my-lg border-l-4 border-primary py-sm pl-md text-article-quote italic text-fg-quote [&_p]:mb-0 [&_p]:text-article-quote">
        {children}
      </blockquote>
    ),
    ul: ({ children }) => (
      <ul className="mb-md list-disc space-y-xs pl-lg text-article-body text-fg-body">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-md list-decimal space-y-xs pl-lg text-article-body text-fg-body">{children}</ol>
    ),
    li: ({ children }) => <li className="text-fg-body">{children}</li>,
    hr: () => <hr className="my-xl border-border-subtle" />,
  };
}

// Shared shape for the two closing link lists (Astro renders both as `divide-y` rows). Sources
// entries get an `id` so the inline footnote markers have somewhere to land.
function LinkSection({
  title,
  links,
  id,
  numbered = false,
}: {
  title: string;
  links: ArticleLink[];
  id?: string;
  numbered?: boolean;
}): JSX.Element {
  return (
    <section id={id} className="mt-2xl border-t border-border-subtle pt-xl">
      {/* `text-xl` (20px), the Astro section heading — not the 22px `text.h2` chrome token. */}
      <h2 className="mb-lg text-xl font-display font-bold text-fg">{title}</h2>
      <ul className="divide-y divide-primary/20">
        {links.map((link, i) => (
          <li
            key={link.url}
            id={numbered ? `source-${i + 1}` : undefined}
            className="py-md [scroll-margin-top:5rem]"
          >
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[44px] flex-col justify-center font-bold text-primary hover:underline"
            >
              {numbered ? `${i + 1}. ${link.title}` : link.title}
            </a>
            {link.description ? (
              <p className="mt-xs text-sm text-fg-muted">— {link.description}</p>
            ) : null}
            {numbered && link.domain ? (
              <p className="mt-xs text-xs uppercase text-fg-muted">{link.domain}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// `ArticleView` — full article reader (DESIGN §2). Visual lineage with the Astro ArticleLayout:
// full-bleed 16/9 hero with a gradient scrim, a content card pulled up over it, a kind badge +
// theme tags, an author byline, the editorial type scale, then the "Pour aller plus loin" /
// Sources lists and the AI disclaimer. The footer opens the F-010 two-tap ShareSheet.
export function ArticleView({ article }: { article: Article }): JSX.Element {
  // Hero failure must not blank the reader — the body still renders (LCP is text-first).
  const [heroFailed, setHeroFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const hasHero = Boolean(article.image) && !heroFailed;

  const { intro, sources, further } = useMemo(() => splitArticleBody(article.body), [article.body]);
  // First occurrence wins, matching Astro's `sourceByUrl` map build.
  const sourceIndexByUrl = useMemo(() => {
    const map = new Map<string, number>();
    sources.forEach((s, i) => {
      if (!map.has(s.url)) map.set(s.url, i + 1);
    });
    return map;
  }, [sources]);
  // Deliberately NOT memoized: the returned renderers carry the paragraph counter that marks the
  // lead paragraph, so it has to be rebuilt (and reset) for every render pass. Memoizing it makes
  // the lead styling disappear the first time anything else re-renders the reader.
  const components = markdownComponents(sourceIndexByUrl);

  // Astro's card badge wording: `veille` → "Veille", `blog` → "Article".
  const kindLabel = article.frontmatter.kind === "blog" ? "Article" : "Veille";
  // Astro loops over `themes[]`; fall back to the single denormalised theme.
  const tags = article.frontmatter.tags?.length ? article.frontmatter.tags : [article.theme];

  return (
    <article>
      {hasHero ? (
        // Full-viewport-width hero, flush under the header — `AppShell`'s `main` is unconstrained
        // and unpadded, so this needs no negative-margin escape (Astro: `<section class="w-full">`).
        <section className="relative aspect-[16/9] max-h-[70vh] w-full overflow-hidden">
          <img
            src={heroUrl(article.image)}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setHeroFailed(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-inverted/80 to-transparent" />
        </section>
      ) : null}
      {/* Content card overlaps the hero's bottom edge (Astro's `max-w-[800px] mx-auto px-4 -mt-24
          rounded-t-3xl`), or sits flush at the top when there's no hero. */}
      <div
        className={cn(
          // `pb-20` is the Astro card's bottom padding; `main` no longer supplies any.
          "mx-auto w-full max-w-reading px-md pb-20 sm:px-lg",
          hasHero ? "relative z-10 -mt-4xl rounded-t-2xl bg-bg pt-xl" : "pt-lg",
        )}
      >
        <div className="mb-lg flex flex-wrap items-center gap-xs">
          <TagPill label={kindLabel} />
          {tags.map((tag) => (
            <TagPill key={tag} label={tag} />
          ))}
        </div>
        <h1 className="text-article-title font-display tracking-tight text-fg md:text-article-title-lg">
          {article.frontmatter.title}
        </h1>
        <div className="mt-lg flex items-center gap-md border-b border-border-subtle pb-lg">
          {!avatarFailed ? (
            <img
              src={AUTHOR_AVATAR_URL}
              alt=""
              className="size-12 shrink-0 rounded-full object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-xl"
            >
              🦉
            </span>
          )}
          <div>
            <p className="font-bold text-fg">Aurélien Allienne</p>
            <p className="text-sm text-fg-muted">
              Publié le {formatDateLong(article.date)} • {estimateReadingTime(intro)}
            </p>
          </div>
        </div>
        <div className="mt-lg">
          <ReactMarkdown components={components}>{intro}</ReactMarkdown>
        </div>
        {further.length > 0 ? <LinkSection title="Pour aller plus loin" links={further} /> : null}
        {sources.length > 0 ? (
          <LinkSection title="Sources" links={sources} id="sources" numbered />
        ) : null}
        <p className="mt-3xl border-t border-border-subtle pt-xl text-sm italic text-fg-muted">
          {AI_DISCLAIMER}
        </p>
        <footer data-testid="share-footer-slot" className="mt-2xl">
          <Button variant="secondary" onClick={() => setShareOpen(true)}>
            <Share2 className="h-5 w-5" aria-hidden="true" />
            Partager
          </Button>
        </footer>
      </div>
      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        linkedin={article.linkedin}
        imageUrl={heroUrl(article.image)}
        imageFilename={article.image}
      />
    </article>
  );
}
