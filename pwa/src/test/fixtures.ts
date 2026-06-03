import type { Article } from "@veilleur/shared/article";
import type { Run, RunStep } from "@veilleur/shared/run";

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

/** Build a RunStep fixture; override any field. */
export function makeStep(overrides: Partial<RunStep> = {}): RunStep {
  return {
    name: "gmail",
    status: "success",
    startedAt: "2026-06-01T06:00:00.000Z",
    endedAt: "2026-06-01T06:00:05.000Z",
    error: null,
    ...overrides,
  };
}

/** Build a valid Run fixture; override any field. */
export function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    runId: "01J0RUN",
    date: "2026-06-01",
    status: "running",
    startedAt: "2026-06-01T06:00:00.000Z",
    endedAt: null,
    error: null,
    costUsd: null,
    tokens: null,
    steps: [makeStep()],
    ...overrides,
  };
}
