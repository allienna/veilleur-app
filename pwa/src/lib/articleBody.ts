// Splits a published article's Markdown into the prose to render and the two link sections the
// reader shows as styled lists instead of raw Markdown. Direct port of the parsing in
// ../veilleur/site/src/layouts/ArticleLayout.astro — same regexes, so both surfaces agree on
// what counts as a source. The Astro site hides these sections with CSS
// (`.article-intro > h2#sources ~ *`); the PWA has no `prose` plugin, so it truncates instead.

export interface ArticleLink {
  title: string;
  url: string;
  /** Hostname without `www.`, or "" when the URL doesn't parse. */
  domain: string;
  /** Only "Pour aller plus loin" entries carry the `— …` trailing note. */
  description?: string;
}

export interface SplitArticle {
  /** Markdown to render: everything before the first link section. */
  intro: string;
  sources: ArticleLink[];
  further: ArticleLink[];
}

const SECTION_HEADING = /^## (?:Sources|Pour aller plus loin)\s*$/m;

/** `1. [title](url)` / `- [title](url)`, with an optional ` — description`. */
const LINK = /[-\d.]+\s*\[(.+?)\]\((.+?)\)(?:\s*—\s*(.+))?/gm;

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

/** Extract the body of `## <heading>` up to the next `## ` (or end of text). */
function section(body: string, heading: string): string {
  // No `m` flag: the trailing `$` must mean end-of-input, not end-of-line, or the lazy group
  // matches nothing at all. Same regex as the Astro layout.
  const match = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(body);
  return match?.[1] ?? "";
}

function parseLinks(text: string): ArticleLink[] {
  // `LINK` is global and therefore stateful — reset before each use.
  LINK.lastIndex = 0;
  const links: ArticleLink[] = [];
  let match: RegExpExecArray | null;
  while ((match = LINK.exec(text)) !== null) {
    const [, title, url, description] = match;
    if (!title || !url) continue;
    links.push({
      title,
      url,
      domain: domainOf(url),
      ...(description?.trim() ? { description: description.trim() } : {}),
    });
  }
  return links;
}

export function splitArticleBody(body: string): SplitArticle {
  const cut = SECTION_HEADING.exec(body);
  return {
    intro: (cut ? body.slice(0, cut.index) : body).trimEnd(),
    sources: parseLinks(section(body, "Sources")),
    further: parseLinks(section(body, "Pour aller plus loin")),
  };
}
