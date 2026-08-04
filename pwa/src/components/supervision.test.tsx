import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RunNowButton } from "@/components/RunNowButton";
import { RunStepRow } from "@/components/RunStepRow";
import { RunTimeline } from "@/components/RunTimeline";
import { StatusPill } from "@/components/StatusPill";
import { makeRun, makeStep } from "@/test/fixtures";

// RunTimeline → data/runs → @/firebase initializes a real Firebase app otherwise.
vi.mock("@/firebase", () => ({ db: {}, auth: {} }));

const triggerRun = vi.fn();
vi.mock("@/data/trigger", () => ({ triggerRun: (...a: unknown[]) => triggerRun(...a) }));

beforeEach(() => {
  triggerRun.mockReset();
});

describe("StatusPill (dual-encoded status, AC-8)", () => {
  it.each([
    ["success", "succès"],
    ["success_with_warnings", "avec avertissements"],
    ["failure", "échec"],
    ["skipped", "ignoré"],
    ["aborted", "interrompu"],
    ["running", "en cours"],
  ] as const)("renders the verb for %s (never colour alone)", (status, verb) => {
    render(<StatusPill status={status} />);
    expect(screen.getByText(verb)).toBeInTheDocument();
  });
});

describe("RunStepRow", () => {
  it("renders a pending step (no record) with a dash, not a duration", () => {
    render(
      <ul>
        <RunStepRow name="generate" />
      </ul>,
    );
    expect(screen.getByText("Génération")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("pulses the running step under motion-safe only (static under reduced motion, AC-8)", () => {
    const { container } = render(
      <ul>
        <RunStepRow name="generate" step={makeStep({ name: "generate", status: "running", endedAt: null })} />
      </ul>,
    );
    expect(container.querySelector(".motion-safe\\:animate-pulse")).not.toBeNull();
  });

  it("shows a fixed duration for a completed step", () => {
    render(
      <ul>
        <RunStepRow
          name="gmail"
          step={makeStep({
            startedAt: "2026-06-01T06:00:00.000Z",
            endedAt: "2026-06-01T06:00:05.000Z",
          })}
        />
      </ul>,
    );
    expect(screen.getByText("5,0 s")).toBeInTheDocument();
  });

  it("shows a step's own error inline (F-016 FR-3)", () => {
    render(
      <ul>
        <RunStepRow name="jina" step={makeStep({ name: "jina", status: "failure", error: "boom" })} />
      </ul>,
    );
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("shows nothing extra when a step has no error", () => {
    render(
      <ul>
        <RunStepRow name="gmail" step={makeStep({ error: null })} />
      </ul>,
    );
    expect(screen.queryByText(/./, { selector: "p" })).not.toBeInTheDocument();
  });
});

describe("RunTimeline", () => {
  it("renders all ten steps in canonical order with the run status", () => {
    render(<RunTimeline run={makeRun({ status: "running", steps: [makeStep({ name: "gmail" })] })} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("Gmail")).toBeInTheDocument();
    expect(screen.getByText("Mise en ligne")).toBeInTheDocument();
    expect(screen.getByText("en cours")).toBeInTheDocument();
  });

  it("surfaces a run-level error in an alert", () => {
    render(<RunTimeline run={makeRun({ status: "failure", error: "generate: boom" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("generate: boom");
  });

  it("shows a structured breakdown when the error matches the scrape-gate shape (F-016 FR-2)", () => {
    const { container } = render(
      <RunTimeline
        run={makeRun({
          status: "failure",
          error: "insufficient_sources: 12/100 ok (3 paywalled, 85 failed; need ≥5 and ≥50%)",
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("insufficient_sources");
    expect(container).toHaveTextContent("Sources : 12/100 ok · 3 payantes · 85 en échec");
  });

  it("falls back to the raw string when the error doesn't match a known shape", () => {
    const { container } = render(
      <RunTimeline run={makeRun({ status: "failure", error: "generate: claude /generate timed out" })} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("timed out");
    expect(container).not.toHaveTextContent("Sources :");
  });
});

describe("RunNowButton (AC-6, AC-7)", () => {
  it("triggers a run and reports the returned date", async () => {
    triggerRun.mockResolvedValue("2026-06-03");
    const onTriggered = vi.fn();
    render(<RunNowButton onTriggered={onTriggered} />);
    await userEvent.click(screen.getByRole("button", { name: "Lancer un run" }));
    await waitFor(() => expect(onTriggered).toHaveBeenCalledWith("2026-06-03"));
  });

  it("is disabled with a caption while a run is in progress", () => {
    render(<RunNowButton runInProgress onTriggered={vi.fn()} />);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText("Un run est déjà en cours")).toBeInTheDocument();
  });

  it("shows an inline error and does not navigate on failure", async () => {
    triggerRun.mockRejectedValue(new Error("403"));
    const onTriggered = vi.fn();
    render(<RunNowButton onTriggered={onTriggered} />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByText("Échec du déclenchement. Réessayez.")).toBeInTheDocument(),
    );
    expect(onTriggered).not.toHaveBeenCalled();
  });
});
