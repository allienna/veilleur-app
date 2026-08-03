// Splits a fiche's Markdown body into its four named sections. Port of
// ../veilleur/site/src/layouts/FicheLayout.astro's `extractSection`/`extractListItems` — same
// headings, same order. Slightly more lenient on whitespace than the Astro regex (`\n+` instead
// of exactly `\n\n` after the heading): the Minion's generated fiches aren't guaranteed to always
// insert the blank line a human-written one would.

export interface FicheSections {
  summary: string;
  keyPoints: string[];
  analysis: string;
  whyItMatters: string;
}

function extractSection(body: string, heading: string): string {
  const match = new RegExp(`## ${heading}\\n+([\\s\\S]*?)(?=\\n## |$)`).exec(body);
  return match?.[1]?.trim() ?? "";
}

function extractListItems(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

export function splitFicheBody(body: string): FicheSections {
  return {
    summary: extractSection(body, "Résumé"),
    keyPoints: extractListItems(extractSection(body, "Points clés")),
    analysis: extractSection(body, "Analyse approfondie"),
    whyItMatters: extractSection(body, "Pourquoi ça compte"),
  };
}
