import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppFooter } from "@/components/AppFooter";
import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { ArticleCard } from "@/components/ArticleCard";
import { ArticleView } from "@/components/ArticleView";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { RunTimeline } from "@/components/RunTimeline";
import { SignInScreen } from "@/components/SignInScreen";
import { TagPill } from "@/components/TagPill";
import { UnauthorizedScreen } from "@/components/UnauthorizedScreen";
import { PUBLIC_SITE_URL, REAUTH_RUNBOOK_URL } from "@/config";
import { makeArticle, makeRun } from "@/test/fixtures";

// RunTimeline pulls @/data/runs (→ @/firebase); avoid initializing a real Firebase app in tests.
vi.mock("@/firebase", () => ({ db: {} }));

describe("TagPill", () => {
  it("renders the theme label", () => {
    render(<TagPill label="IA" />);
    expect(screen.getByText("IA")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders title and subline (DESIGN §4 Empty)", () => {
    render(<EmptyState title="Pas d'article aujourd'hui" subline="Aucune source." />);
    expect(screen.getByText("Pas d'article aujourd'hui")).toBeInTheDocument();
    expect(screen.getByText("Aucune source.")).toBeInTheDocument();
  });
});

describe("ErrorBanner", () => {
  it("renders an alert with the message (DESIGN §4 Error)", () => {
    render(<ErrorBanner message="Mode hors ligne" variant="info" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Mode hors ligne");
  });
});

describe("RunTimeline auth-failure banner (F-013 FR-1)", () => {
  it("links to the re-auth runbook when a run fails on an auth error", () => {
    render(
      <RunTimeline
        run={makeRun({
          status: "failure",
          error: "gmail: ('invalid_grant: Token has been expired or revoked.',)",
        })}
      />,
    );
    const link = screen.getByRole("link", { name: /ré-authentification/i });
    expect(link).toHaveAttribute("href", REAUTH_RUNBOOK_URL);
  });

  it("shows no runbook link for a generic (non-auth) failure", () => {
    render(
      <RunTimeline
        run={makeRun({ status: "failure", error: "jina: scrape threshold not met (3/10)" })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("scrape threshold not met");
    expect(screen.queryByRole("link", { name: /ré-authentification/i })).not.toBeInTheDocument();
  });

  it("shows no error banner when the run has no run-level error", () => {
    render(<RunTimeline run={makeRun({ status: "success_with_warnings", error: null })} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AppHeader", () => {
  it("renders the three nav targets (DESIGN §3)", () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Aujourd'hui" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Articles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Supervision" })).toBeInTheDocument();
  });
});

// Guards a rendering baseline that no component test can see: Tailwind is not applied in jsdom, so
// these are asserted on the stylesheet source. Their absence made the PWA's type look like a
// different typeface from the public site even though every size and weight matched.
describe("base stylesheet", () => {
  // Vitest runs with the `pwa` package root as cwd. Comments are stripped so a passing mention of
  // a property name in prose cannot satisfy these assertions.
  const css = readFileSync("src/index.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("antialiases the body, as the Astro global.css does", () => {
    // Without this, macOS/WebKit uses subpixel antialiasing and renders both faces heavier.
    expect(css).toMatch(/body\s*\{[^}]*antialiased/);
  });

  it("sets the display face on h1 through h6, not just h1-h3", () => {
    expect(css).toMatch(/h4,\s*h5,\s*h6\s*\{\s*@apply font-display/);
  });
});

describe("AppShell", () => {
  it("leaves `main` unconstrained so routes own their width (DESIGN §3)", () => {
    const { container } = render(
      <MemoryRouter>
        <AppShell>
          <p>contenu</p>
        </AppShell>
      </MemoryRouter>,
    );
    const main = container.querySelector("main");
    // A width cap here is what previously stopped the article hero from spanning the viewport and
    // the listing grid from reaching 1152px.
    expect(main?.className).not.toMatch(/max-w-/);
    expect(main?.className).not.toMatch(/\bp[xy]?-/);
  });

  it("stacks the header above article content", () => {
    const { container } = render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );
    // The article card is `z-10`; at an equal z-index DOM order would put it over the header.
    expect(container.querySelector("header")).toHaveClass("z-50");
  });
});

describe("AppFooter", () => {
  it("points its secondary nav and RSS at the public site, safely", () => {
    render(<AppFooter />);
    for (const name of ["Confidentialité", "Mentions Légales", "Newsletter", "Contact"]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", expect.stringContaining(PUBLIC_SITE_URL));
      // These leave the app, so they must not hand the opener over.
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAttribute("target", "_blank");
    }
    expect(screen.getByRole("link", { name: "Flux RSS" })).toHaveAttribute(
      "href",
      `${PUBLIC_SITE_URL}/rss.xml`,
    );
  });
});

describe("ArticleCard", () => {
  it("links to the article and shows title + theme", () => {
    render(
      <MemoryRouter>
        <ArticleCard article={makeArticle()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Un titre d'article")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/article/2026-06-01");
  });

  it("renders one pill per frontmatter tag, capped at three", () => {
    const article = makeArticle({
      theme: "IA",
      frontmatter: {
        ...makeArticle().frontmatter,
        tags: ["ai", "agents", "productivite", "quatrieme"],
      },
    });
    render(
      <MemoryRouter>
        <ArticleCard article={article} />
      </MemoryRouter>,
    );
    // The card used to render the single scalar `theme`; the tag list is what the Astro card shows.
    for (const tag of ["ai", "agents", "productivite"]) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }
    expect(screen.queryByText("quatrieme")).not.toBeInTheDocument();
    expect(screen.queryByText("IA")).not.toBeInTheDocument();
  });

  it("falls back to the scalar theme when there are no tags", () => {
    const article = makeArticle({
      theme: "IA",
      frontmatter: { ...makeArticle().frontmatter, tags: [] },
    });
    render(
      <MemoryRouter>
        <ArticleCard article={article} />
      </MemoryRouter>,
    );
    expect(screen.getByText("IA")).toBeInTheDocument();
  });

  it("labels the kind badge from frontmatter.kind", () => {
    const { unmount } = render(
      <MemoryRouter>
        <ArticleCard article={makeArticle()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Veille")).toBeInTheDocument();
    unmount();
    render(
      <MemoryRouter>
        <ArticleCard
          article={makeArticle({
            frontmatter: { ...makeArticle().frontmatter, kind: "blog" },
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.getByText("Billet personnel")).toBeInTheDocument();
  });
});

describe("ArticleView", () => {
  it("renders title and body; keeps the reserved share-footer slot", () => {
    render(<ArticleView article={makeArticle()} />);
    expect(screen.getByRole("heading", { name: "Un titre d'article" })).toBeInTheDocument();
    expect(screen.getByText("Corps de l'article.")).toBeInTheDocument();
    expect(screen.getByTestId("share-footer-slot")).toBeInTheDocument();
  });

  it("lifts `## Sources` out of the prose into a Sources list with a footnote anchor", () => {
    const url = "https://blog.example.com/p/x";
    render(
      <ArticleView
        article={makeArticle({
          body: [
            "Le chapô.",
            "",
            `Un fait sourcé [[1](${url})].`,
            "",
            "## Sources",
            "",
            `1. [Le titre de la source](${url})`,
            "",
          ].join("\n"),
        })}
      />,
    );
    // The raw list is gone from the prose; only the styled section renders it.
    expect(screen.queryByText(/^1\. \[Le titre/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sources" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Le titre de la source/ })).toHaveAttribute("href", url);
    // The inline `[1]` marker points at the entry rather than leaving the article.
    expect(screen.getByRole("link", { name: "Source 1" })).toHaveAttribute("href", "#source-1");
  });

  it("sizes a blockquote's inner paragraph as a pull quote, not body text", () => {
    const { container } = render(
      <ArticleView
        article={makeArticle({ body: "Le chapô.\n\n> Une citation qui compte.\n" })}
      />,
    );
    const quoted = container.querySelector("blockquote p");
    expect(quoted?.textContent).toBe("Une citation qui compte.");
    // Markdown wraps the quote in a `<p>`, which the paragraph renderer sets to `text-article-body`
    // (18px); the blockquote's descendant variant must out-specify it back to 24px.
    expect(quoted).toHaveClass("text-article-body");
    const blockquote = container.querySelector("blockquote");
    expect(blockquote).toHaveClass("[&_p]:text-article-quote");
  });

  // These three drifted once by substituting `text.caption` (13px/500) for the Astro article's raw
  // `text-sm` / `text-xs` (14px/400, 12px/400) and by dropping `prose`'s link weight. Values are
  // verified against the compiled Astro CSS; see DESIGN §1 "Editorial scale".
  it("matches the Astro article's small-text scale and link weight", () => {
    const url = "https://blog.example.com/p/x";
    const { container } = render(
      <ArticleView
        article={makeArticle({
          body: [
            "Le chapô.",
            "",
            `Un [lien externe](https://example.com/a) et un renvoi [[1](${url})].`,
            "",
            "## Sources",
            "",
            `1. [La source](${url})`,
            "",
          ].join("\n"),
        })}
      />,
    );
    expect(screen.getByRole("link", { name: "lien externe" })).toHaveClass("font-medium");
    // The footnote marker is styled as a plain body link, like the Astro one — a padded pill
    // pushed the surrounding `[ ]` apart.
    expect(screen.getByRole("link", { name: "Source 1" })).toHaveClass("font-medium", "text-primary");
    // Byline meta line and the AI disclaimer.
    expect(screen.getByText(/Publié le/)).toHaveClass("text-sm");
    expect(screen.getByText(/rédigé en m'appuyant sur une IA/)).toHaveClass("text-sm");
    expect(container.querySelector("#sources h2")).toHaveClass("text-xl");
  });

  // The Astro layout keeps body copy a step lighter than headings; collapsing both onto the heading
  // colour rendered the reader visibly darker, which reads as a heavier typeface.
  it("keeps body copy on the prose tone, not the heading tone", () => {
    const { container } = render(
      <ArticleView
        article={makeArticle({
          body: "Le chapô.\n\nUn paragraphe.\n\n## Un titre\n\n> Une citation.\n\n- Un item\n",
        })}
      />,
    );
    const paragraphs = [...container.querySelectorAll("p.text-article-body")];
    expect(paragraphs.length).toBeGreaterThan(0);
    for (const p of paragraphs) expect(p).toHaveClass("text-fg-body");
    expect(container.querySelector("ul")).toHaveClass("text-fg-body");
    expect(container.querySelector("blockquote")).toHaveClass("text-fg-quote");
    // Headings and `strong` stay on the default (darkest) foreground.
    expect(container.querySelector("h2.text-article-h2")).toHaveClass("text-fg");
  });

  it("keeps the lead paragraph styled across re-renders", async () => {
    const article = makeArticle({ body: "Le chapô.\n\nLa suite du corps.\n" });
    const { container } = render(<ArticleView article={article} />);
    const lead = () => container.querySelector("p.text-article-lead");
    expect(lead()?.textContent).toBe("Le chapô.");
    // The paragraph counter lives in the renderer map; if that map were memoized, this second
    // render pass would leave the lead unstyled.
    await userEvent.click(screen.getByRole("button", { name: /Partager/ }));
    expect(lead()?.textContent).toBe("Le chapô.");
  });
});

describe("auth screens", () => {
  it("SignInScreen fires onSignIn", async () => {
    const onSignIn = vi.fn();
    render(<SignInScreen onSignIn={onSignIn} />);
    await userEvent.click(screen.getByRole("button", { name: /Se connecter/ }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("UnauthorizedScreen shows the terminal message and fires onSignOut", async () => {
    const onSignOut = vi.fn();
    render(<UnauthorizedScreen onSignOut={onSignOut} />);
    expect(screen.getByText("Non autorisé")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Se déconnecter/ }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
