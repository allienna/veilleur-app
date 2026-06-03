import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArticleView } from "@/components/ArticleView";
import { ShareSheet } from "@/components/ShareSheet";
import { makeArticle } from "@/test/fixtures";

// Mock sonner so we assert on toast intent directly rather than the Toaster's DOM/timing.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));
import { toast } from "sonner";

const success = vi.mocked(toast.success);
const error = vi.mocked(toast.error);

/** Define (or clear) a property on `navigator` that jsdom does not provide. */
function setNav(prop: string, value: unknown): void {
  Object.defineProperty(navigator, prop, { configurable: true, value });
}

function setReducedMotion(reduce: boolean): void {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"], { type: "image/webp" }) }),
  );
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setNav("clipboard", undefined);
  setNav("share", undefined);
  setNav("canShare", undefined);
  setReducedMotion(false);
});

describe("ShareSheet — open flow via ArticleView (AC-1)", () => {
  it("the footer 'Partager' button opens the sheet with both actions", async () => {
    render(<ArticleView article={makeArticle()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Partager" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: /Copier le post/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enregistrer l'image/ })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(<ArticleView article={makeArticle()} />);
    await userEvent.click(screen.getByRole("button", { name: "Partager" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("ShareSheet — copy (AC-2, AC-4)", () => {
  function renderOpen(onOpenChange = vi.fn()) {
    render(
      <ShareSheet
        open
        onOpenChange={onOpenChange}
        linkedin="Post LinkedIn."
        imageUrl="https://cdn/img/2026-06-01.webp"
        imageFilename="2026-06-01.webp"
      />,
    );
    return onOpenChange;
  }

  it("copies the LinkedIn post and confirms with a success toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNav("clipboard", { writeText });
    renderOpen();
    await userEvent.click(screen.getByRole("button", { name: /Copier le post/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Post LinkedIn."));
    expect(success).toHaveBeenCalledWith("Post copié");
  });

  it("on copy failure shows an error toast and leaves the sheet open", async () => {
    setNav("clipboard", { writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    const onOpenChange = renderOpen();
    await userEvent.click(screen.getByRole("button", { name: /Copier le post/ }));
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("ShareSheet — save image (AC-3, AC-5)", () => {
  function renderOpen() {
    render(
      <ShareSheet
        open
        onOpenChange={vi.fn()}
        linkedin="Post LinkedIn."
        imageUrl="https://cdn/img/2026-06-01.webp"
        imageFilename="2026-06-01.webp"
      />,
    );
  }

  it("uses the Web Share API with a File when available (no toast — OS sheet replaces it)", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNav("canShare", vi.fn().mockReturnValue(true));
    setNav("share", share);
    renderOpen();
    await userEvent.click(screen.getByRole("button", { name: /Enregistrer l'image/ }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(success).not.toHaveBeenCalled();
  });

  it("falls back to <a download> and confirms with a success toast", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderOpen();
    await userEvent.click(screen.getByRole("button", { name: /Enregistrer l'image/ }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(success).toHaveBeenCalledWith("Image enregistrée");
    click.mockRestore();
  });

  it("on image fetch failure shows an error toast; copy still works", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    setNav("clipboard", { writeText: vi.fn().mockResolvedValue(undefined) });
    renderOpen();
    await userEvent.click(screen.getByRole("button", { name: /Enregistrer l'image/ }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Image indisponible"));
    await userEvent.click(screen.getByRole("button", { name: /Copier le post/ }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Post copié"));
  });
});

describe("ShareSheet — reduced motion (AC-6)", () => {
  it("omits the slide-in transition when prefers-reduced-motion is set", async () => {
    setReducedMotion(true);
    render(<ArticleView article={makeArticle()} />);
    await userEvent.click(screen.getByRole("button", { name: "Partager" }));
    expect(screen.getByRole("dialog").className).not.toContain("transition-transform");
  });

  it("applies the slide-in transition by default", async () => {
    setReducedMotion(false);
    render(<ArticleView article={makeArticle()} />);
    await userEvent.click(screen.getByRole("button", { name: "Partager" }));
    expect(screen.getByRole("dialog").className).toContain("transition-transform");
  });
});
