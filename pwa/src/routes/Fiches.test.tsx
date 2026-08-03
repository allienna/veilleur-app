import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiche } from "@/test/fixtures";

const listFichesForArticle = vi.fn();
vi.mock("@/data/fiches", () => ({
  listFichesForArticle: (date: string) => listFichesForArticle(date),
}));

const { default: Fiches } = await import("@/routes/Fiches");

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Fiches />
    </MemoryRouter>,
  );
}

describe("Fiches", () => {
  beforeEach(() => listFichesForArticle.mockReset());

  it("queries only the cited article's fiches, keyed off the ?article= param", async () => {
    listFichesForArticle.mockResolvedValue([makeFiche()]);
    renderAt("/fiches?article=2026-06-01");
    await waitFor(() => expect(screen.getByText("Une source")).toBeInTheDocument());
    expect(listFichesForArticle).toHaveBeenCalledWith("2026-06-01");
  });

  it("shows an empty state without querying when there is no ?article= param", () => {
    renderAt("/fiches");
    expect(screen.getByText("Aucun article sélectionné")).toBeInTheDocument();
    expect(listFichesForArticle).not.toHaveBeenCalled();
  });

  it("shows an empty state when the article has no fiches", async () => {
    listFichesForArticle.mockResolvedValue([]);
    renderAt("/fiches?article=2026-06-01");
    await waitFor(() => expect(screen.getByText("Aucune analyse disponible")).toBeInTheDocument());
  });
});
