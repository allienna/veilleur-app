import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiche } from "@/test/fixtures";

const getFiche = vi.fn();
vi.mock("@/data/fiches", () => ({ getFiche: (slug: string) => getFiche(slug) }));

const { default: Fiche } = await import("@/routes/Fiche");

describe("Fiche", () => {
  beforeEach(() => getFiche.mockReset());

  it("loads the fiche for the :slug param and renders it", async () => {
    getFiche.mockResolvedValue(makeFiche({ slug: "une-source" }));
    render(
      <MemoryRouter initialEntries={["/fiches/une-source"]}>
        <Routes>
          <Route path="/fiches/:slug" element={<Fiche />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "Une source" })).toBeInTheDocument());
    expect(getFiche).toHaveBeenCalledWith("une-source");
  });

  it("shows an empty state when the fiche doesn't exist", async () => {
    getFiche.mockResolvedValue(null);
    render(
      <MemoryRouter initialEntries={["/fiches/absente"]}>
        <Routes>
          <Route path="/fiches/:slug" element={<Fiche />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Analyse introuvable")).toBeInTheDocument());
  });
});
