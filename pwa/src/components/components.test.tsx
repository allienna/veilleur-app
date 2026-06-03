import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppHeader } from "@/components/AppHeader";
import { ArticleCard } from "@/components/ArticleCard";
import { ArticleView } from "@/components/ArticleView";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { RunTimeline } from "@/components/RunTimeline";
import { SignInScreen } from "@/components/SignInScreen";
import { TagPill } from "@/components/TagPill";
import { UnauthorizedScreen } from "@/components/UnauthorizedScreen";
import { REAUTH_RUNBOOK_URL } from "@/config";
import { makeArticle, makeRun } from "@/test/fixtures";

// RunTimeline pulls @/data/runs (→ @/firebase); avoid initializing a real Firebase app in tests.
vi.mock("@/firebase", () => ({ db: {} }));

describe("TagPill", () => {
  it("renders the theme label", () => {
    render(<TagPill label="IA" />);
    expect(screen.getByText("IA")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders title and subline (DESIGN §4 Empty)", () => {
    render(<EmptyState title="Pas d'article aujourd'hui" subline="Aucune source." />);
    expect(screen.getByText("Pas d'article aujourd'hui")).toBeInTheDocument();
    expect(screen.getByText("Aucune source.")).toBeInTheDocument();
  });
});

describe("ErrorBanner", () => {
  it("renders an alert with the message (DESIGN §4 Error)", () => {
    render(<ErrorBanner message="Mode hors ligne" variant="info" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Mode hors ligne");
  });
});

describe("RunTimeline auth-failure banner (F-013 FR-1)", () => {
  it("links to the re-auth runbook when a run fails on an auth error", () => {
    render(
      <RunTimeline
        run={makeRun({
          status: "failure",
          error: "gmail: ('invalid_grant: Token has been expired or revoked.',)",
        })}
      />,
    );
    const link = screen.getByRole("link", { name: /ré-authentification/i });
    expect(link).toHaveAttribute("href", REAUTH_RUNBOOK_URL);
  });

  it("shows no runbook link for a generic (non-auth) failure", () => {
    render(
      <RunTimeline
        run={makeRun({ status: "failure", error: "jina: scrape threshold not met (3/10)" })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("scrape threshold not met");
    expect(screen.queryByRole("link", { name: /ré-authentification/i })).not.toBeInTheDocument();
  });

  it("shows no error banner when the run has no run-level error", () => {
    render(<RunTimeline run={makeRun({ status: "success_with_warnings", error: null })} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AppHeader", () => {
  it("renders the three nav targets (DESIGN §3)", () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Aujourd'hui" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Historique" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Supervision" })).toBeInTheDocument();
  });
});

describe("ArticleCard", () => {
  it("links to the article and shows title + theme", () => {
    render(
      <MemoryRouter>
        <ArticleCard article={makeArticle()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Un titre d'article")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/article/2026-06-01");
  });
});

describe("ArticleView", () => {
  it("renders title and body; keeps the reserved share-footer slot", () => {
    render(<ArticleView article={makeArticle()} />);
    expect(screen.getByRole("heading", { name: "Un titre d'article" })).toBeInTheDocument();
    expect(screen.getByText("Corps de l'article.")).toBeInTheDocument();
    expect(screen.getByTestId("share-footer-slot")).toBeInTheDocument();
  });
});

describe("auth screens", () => {
  it("SignInScreen fires onSignIn", async () => {
    const onSignIn = vi.fn();
    render(<SignInScreen onSignIn={onSignIn} />);
    await userEvent.click(screen.getByRole("button", { name: /Se connecter/ }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("UnauthorizedScreen shows the terminal message and fires onSignOut", async () => {
    const onSignOut = vi.fn();
    render(<UnauthorizedScreen onSignOut={onSignOut} />);
    expect(screen.getByText("Non autorisé")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Se déconnecter/ }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
