import { describe, expect, it } from "vitest";

import { splitArticleBody } from "@/lib/articleBody";
import { splitFicheBody } from "@/lib/ficheBody";
import { formatDateLong, formatDateShort } from "@/lib/format";
import { heroUrl } from "@/lib/hero";

describe("heroUrl", () => {
  it("resolves a filename against the same-origin images base", () => {
    // Same-origin, not the public Astro site (config.ts ASTRO_IMAGES_BASE) — the Minion
    // currently publishes to this repo, not the live `allienna/veilleur` site (constitution
    // AD-4, deferred flip), so the PWA serves its own copy via a symlinked public/images.
    expect(heroUrl("2026-06-01.webp")).toBe("/images/posts/2026-06-01.webp");
  });
});

describe("date formatting (fr-FR)", () => {
  it("formats a long date in French without TZ day-shift", () => {
    expect(formatDateLong("2026-06-01")).toMatch(/1 juin 2026/);
  });

  it("formats a short date in French", () => {
    expect(formatDateShort("2026-06-01")).toMatch(/2026/);
  });
});

describe("splitArticleBody", () => {
  // Shaped like a real published article (see ../veilleur/site/src/content/articles/*.md).
  const BODY = [
    "# Le titre",
    "",
    "Le chapô de l'article, en une phrase.",
    "",
    "Du corps avec un renvoi [[1](https://blog.bytebytego.com/p/x?utm_source=y)].",
    "",
    "## Sources",
    "",
    "1. [How ChatGPT Optimizes its Agent Loop](https://blog.bytebytego.com/p/x?utm_source=y)",
    "2. [The Answer to the Harness Question](https://www.danielmiessler.com/blog/z)",
    "",
    "## Pour aller plus loin",
    "",
    "- [Agent observability tools](https://montecarlo.ai/blog) — panorama de l'outillage.",
    "- [Sans description](https://example.com/a)",
    "",
  ].join("\n");

  it("truncates the prose at the first link section", () => {
    const { intro } = splitArticleBody(BODY);
    expect(intro).toContain("Le chapô");
    expect(intro).not.toContain("## Sources");
    expect(intro).not.toContain("Pour aller plus loin");
  });

  it("parses numbered sources with their domain", () => {
    const { sources } = splitArticleBody(BODY);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      title: "How ChatGPT Optimizes its Agent Loop",
      domain: "blog.bytebytego.com",
    });
    // `www.` is stripped, matching the Astro layout.
    expect(sources[1]?.domain).toBe("danielmiessler.com");
    expect(sources[0]?.description).toBeUndefined();
  });

  it("parses further-reading entries and their optional description", () => {
    const { further } = splitArticleBody(BODY);
    expect(further).toHaveLength(2);
    expect(further[0]?.description).toBe("panorama de l'outillage.");
    expect(further[1]?.description).toBeUndefined();
  });

  it("handles the sections in the reverse order", () => {
    const reversed = [
      "Le chapô.",
      "",
      "## Pour aller plus loin",
      "",
      "- [A](https://example.com/a)",
      "",
      "## Sources",
      "",
      "1. [B](https://example.com/b)",
      "",
    ].join("\n");
    const { intro, sources, further } = splitArticleBody(reversed);
    expect(intro).toBe("Le chapô.");
    expect(sources).toHaveLength(1);
    expect(further).toHaveLength(1);
  });

  it("returns the whole body when there is no link section", () => {
    const { intro, sources, further } = splitArticleBody("Juste du texte.");
    expect(intro).toBe("Juste du texte.");
    expect(sources).toEqual([]);
    expect(further).toEqual([]);
  });

  it("leaves the domain empty for an unparseable URL", () => {
    const { sources } = splitArticleBody("## Sources\n\n1. [Cassé](pas-une-url)\n");
    expect(sources[0]?.domain).toBe("");
  });
});

describe("splitFicheBody", () => {
  const BODY = [
    "## Résumé",
    "",
    "Un résumé sur deux lignes.",
    "Suite du résumé.",
    "",
    "## Points clés",
    "",
    "- Premier point.",
    "- Deuxième point.",
    "",
    "## Analyse approfondie",
    "",
    "Une analyse plus longue.",
    "",
    "## Pourquoi ça compte",
    "",
    "Parce que oui.",
  ].join("\n");

  it("extracts all four sections in order", () => {
    const { summary, keyPoints, analysis, whyItMatters } = splitFicheBody(BODY);
    expect(summary).toBe("Un résumé sur deux lignes.\nSuite du résumé.");
    expect(keyPoints).toEqual(["Premier point.", "Deuxième point."]);
    expect(analysis).toBe("Une analyse plus longue.");
    expect(whyItMatters).toBe("Parce que oui.");
  });

  it("tolerates a single newline after the heading (no blank line)", () => {
    const tight = "## Résumé\nUn résumé compact.\n\n## Points clés\n- Un point.";
    const { summary, keyPoints } = splitFicheBody(tight);
    expect(summary).toBe("Un résumé compact.");
    expect(keyPoints).toEqual(["Un point."]);
  });

  it("returns empty values when a section is absent", () => {
    const { summary, keyPoints, analysis, whyItMatters } = splitFicheBody("## Résumé\n\nSeul.");
    expect(summary).toBe("Seul.");
    expect(keyPoints).toEqual([]);
    expect(analysis).toBe("");
    expect(whyItMatters).toBe("");
  });
});
