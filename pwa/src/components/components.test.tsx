import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppHeader } from "@/components/AppHeader";
import { ArticleCard } from "@/components/ArticleCard";
import { ArticleView } from "@/components/ArticleView";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SignInScreen } from "@/components/SignInScreen";
import { TagPill } from "@/components/TagPill";
import { UnauthorizedScreen } from "@/components/UnauthorizedScreen";
import { makeArticle } from "@/test/fixtures";

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
