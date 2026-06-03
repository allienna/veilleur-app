import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyText, saveImage } from "@/lib/share";

/** Define (or clear) a property on `navigator` that jsdom does not provide. */
function setNav(prop: string, value: unknown): void {
  Object.defineProperty(navigator, prop, { configurable: true, value });
}

describe("copyText", () => {
  afterEach(() => setNav("clipboard", undefined));

  it("writes the text and reports the clipboard channel", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNav("clipboard", { writeText });
    const result = await copyText("Post LinkedIn.");
    expect(writeText).toHaveBeenCalledWith("Post LinkedIn.");
    expect(result).toEqual({ ok: true, via: "clipboard" });
  });

  it("fails gracefully when the Clipboard API is absent", async () => {
    setNav("clipboard", undefined);
    expect(await copyText("x")).toEqual({ ok: false, reason: "error" });
  });

  it("reports an error when writeText rejects (permission / insecure context)", async () => {
    setNav("clipboard", { writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    expect(await copyText("x")).toEqual({ ok: false, reason: "error" });
  });
});

describe("saveImage", () => {
  const okFetch = () =>
    vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["bytes"], { type: "image/webp" }),
    });

  beforeEach(() => {
    vi.stubGlobal("fetch", okFetch());
    // jsdom lacks object-URL plumbing used by the <a download> fallback.
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setNav("share", undefined);
    setNav("canShare", undefined);
  });

  it("shares the image as a File when the Web Share API can handle files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNav("canShare", vi.fn().mockReturnValue(true));
    setNav("share", share);
    const result = await saveImage("https://cdn/img/2026-06-01.webp", "2026-06-01.webp");
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0] as { files: File[] };
    expect(arg.files[0]).toBeInstanceOf(File);
    expect(arg.files[0].name).toBe("2026-06-01.webp");
    expect(result).toEqual({ ok: true, via: "share" });
  });

  it("falls back to <a download> when file-share is unavailable", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const result = await saveImage("https://cdn/img/x.webp", "x.webp");
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, via: "download" });
    click.mockRestore();
  });

  it("reports an error when the image fetch is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await saveImage("https://cdn/404.webp", "x.webp")).toEqual({
      ok: false,
      reason: "error",
    });
  });

  it("reports an error when the image fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await saveImage("https://cdn/x.webp", "x.webp")).toEqual({
      ok: false,
      reason: "error",
    });
  });

  it("treats a cancelled native share as cancelled, not an error", async () => {
    setNav("canShare", vi.fn().mockReturnValue(true));
    setNav("share", vi.fn().mockRejectedValue(new DOMException("user cancelled", "AbortError")));
    expect(await saveImage("https://cdn/x.webp", "x.webp")).toEqual({
      ok: false,
      reason: "cancelled",
    });
  });
});
