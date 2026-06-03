import { describe, expect, it } from "vitest";

import { formatDateLong, formatDateShort } from "@/lib/format";
import { heroUrl } from "@/lib/hero";

describe("heroUrl", () => {
  it("resolves a filename against the Astro images base", () => {
    expect(heroUrl("2026-06-01.webp")).toBe(
      "https://allienna.github.io/veilleur/images/posts/2026-06-01.webp",
    );
  });
});

describe("date formatting (fr-FR)", () => {
  it("formats a long date in French without TZ day-shift", () => {
    expect(formatDateLong("2026-06-01")).toMatch(/1 juin 2026/);
  });

  it("formats a short date in French", () => {
    expect(formatDateShort("2026-06-01")).toMatch(/2026/);
  });
});
