import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { makeRun } from "@/test/fixtures";

const listRecentRuns = vi.fn();
vi.mock("@/data/runs", () => ({ listRecentRuns: () => listRecentRuns() }));
vi.mock("@/data/pushSubscriptions", () => ({
  currentState: vi.fn().mockResolvedValue("unsubscribed"),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

const { default: Supervision } = await import("@/routes/Supervision");

// No `beforeEach(() => listRecentRuns.mockReset())` — calling `mockReset` from inside a
// lifecycle hook (rather than the start of each test body) makes Vitest mis-attribute the
// rejection-case test's promise as an unhandled rejection in this file, for reasons that didn't
// reproduce in isolation elsewhere. Each test resets/sets the mock itself instead.
describe("Supervision trends (F-016 FR-1)", () => {
  it("shows the empty state when there are no eligible runs in the window", async () => {
    listRecentRuns.mockReset();
    listRecentRuns.mockResolvedValue([
      makeRun({ date: "2026-08-01", status: "skipped" }),
      makeRun({ date: "2026-08-02", status: "aborted" }),
    ]);
    render(
      <MemoryRouter>
        <Supervision />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Pas encore de tendance")).toBeInTheDocument());
  });

  it("renders the rolling success rate, average cost, and top failure cause", async () => {
    listRecentRuns.mockReset();
    listRecentRuns.mockResolvedValue([
      makeRun({ date: "2026-08-04", status: "success", costUsd: 1.0 }),
      makeRun({ date: "2026-08-03", status: "success", costUsd: 0.5 }),
      makeRun({
        date: "2026-08-02",
        status: "failure",
        error: "insufficient_sources: 21/100 ok (0 paywalled, 79 failed)",
        costUsd: null,
      }),
      makeRun({
        date: "2026-08-01",
        status: "failure",
        error: "insufficient_sources: 47/100 ok (3 paywalled, 50 failed)",
        costUsd: null,
      }),
    ]);
    render(
      <MemoryRouter>
        <Supervision />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("50%")).toBeInTheDocument());
    expect(screen.getByText("$0.75")).toBeInTheDocument();
    expect(screen.getByText("Sources insuffisantes")).toBeInTheDocument();
  });

  it("shows an error banner when the run fetch fails", async () => {
    listRecentRuns.mockReset();
    listRecentRuns.mockImplementation(() => Promise.reject(new Error("offline")));
    render(
      <MemoryRouter>
        <Supervision />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("Impossible de calculer les tendances.")).toBeInTheDocument(),
    );
  });
});
