import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrendStat } from "@/components/TrendStat";

describe("TrendStat", () => {
  it("renders the label and pre-formatted value", () => {
    render(<TrendStat label="Taux de succès (21j)" value="72%" fraction={0.72} tone="success" />);
    expect(screen.getByText("Taux de succès (21j)")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
  });

  it("sizes the micro-bar to the given fraction", () => {
    const { container } = render(
      <TrendStat label="Coût cumulé" value="$4.20" fraction={0.4} tone="neutral" />,
    );
    const bar = container.querySelector('[style*="width"]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute("style")).toContain("40%");
  });

  it("clamps an out-of-range fraction instead of overflowing the bar", () => {
    const { container } = render(
      <TrendStat label="x" value="x" fraction={1.5} tone="error" />,
    );
    const bar = container.querySelector('[style*="width"]');
    expect(bar?.getAttribute("style")).toContain("100%");
  });

  it("marks the bar decorative so it never carries information alone (DESIGN §5)", () => {
    const { container } = render(
      <TrendStat label="x" value="x" fraction={0.5} tone="warning" />,
    );
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
