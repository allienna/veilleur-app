import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeArticle } from "@/test/fixtures";

const listRecentArticles = vi.fn();
vi.mock("@/data/articles", () => ({ listRecentArticles: () => listRecentArticles() }));

const { default: History } = await import("@/routes/History");

function article(date: string, title: string) {
  return makeArticle({
    date,
    frontmatter: { ...makeArticle().frontmatter, title },
  });
}

describe("History", () => {
  beforeEach(() => listRecentArticles.mockReset());

  it("features the newest article and never repeats it in the grid", async () => {
    listRecentArticles.mockResolvedValue([
      article("2026-06-03", "Le plus récent"),
      article("2026-06-02", "Le deuxième"),
      article("2026-06-01", "Le troisième"),
    ]);
    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Le plus récent" })).toBeInTheDocument(),
    );
    // Featured, so it must not also appear as a grid card.
    expect(screen.getAllByText("Le plus récent")).toHaveLength(1);
    expect(screen.getByText("Le deuxième")).toBeInTheDocument();
    expect(screen.getByText("Le troisième")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dernières Analyses" })).toBeInTheDocument();
  });

  it("still fills the grid when there is only one article", async () => {
    listRecentArticles.mockResolvedValue([article("2026-06-01", "Le seul")]);
    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>,
    );

    // Astro falls back to the full list rather than showing an empty grid, so the single entry is
    // both the featured item and the only card.
    await waitFor(() => expect(screen.getAllByText("Le seul")).toHaveLength(2));
  });

  it("shows the empty state when there is nothing to list", async () => {
    listRecentArticles.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("Aucun article pour l'instant")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Dernières Analyses")).not.toBeInTheDocument();
  });
});
