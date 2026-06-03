import type { Article } from "@veilleur/shared/article";

/** Build a valid Article fixture; override any field. */
export function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    date: "2026-06-01",
    slug: "un-article",
    theme: "IA",
    frontmatter: {
      title: "Un titre d'article",
      date: "2026-06-01",
      description: "Une description.",
      tags: ["ia"],
      image: "2026-06-01.webp",
      kind: "veille",
    },
    body: "Corps de l'article.",
    linkedin: "Post LinkedIn.",
    image: "2026-06-01.webp",
    commit_sha: "abc123",
    published: true,
    ...overrides,
  };
}
