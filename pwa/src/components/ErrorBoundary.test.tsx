import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "@/components/ErrorBoundary";

function Boom(): JSX.Element {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("renders children when there is no crash", () => {
    render(
      <ErrorBoundary>
        <p>vivant</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("vivant")).toBeInTheDocument();
  });

  it("renders a recoverable fallback on crash and logs pwa.boundary (DESIGN §4)", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: "Recharger" })).toBeInTheDocument();
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .flat()
      .some((arg) => typeof arg === "string" && arg.includes("pwa.boundary"));
    expect(logged).toBe(true);
  });
});
