import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeArticle } from "@/test/fixtures";

// Avoid initializing a real Firebase app in tests.
vi.mock("@/firebase", () => ({ db: {} }));

// Control the Firestore SDK surface the repo uses.
const getDoc = vi.fn();
const getDocs = vi.fn();
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => getDoc(...args),
  getDocs: (...args: unknown[]) => getDocs(...args),
  limit: vi.fn((n: number) => ({ _limit: n })),
  orderBy: vi.fn((f: string, d: string) => ({ _orderBy: [f, d] })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
}));

import { getArticle, listRecentArticles } from "@/data/articles";

beforeEach(() => {
  getDoc.mockReset();
  getDocs.mockReset();
});

describe("getArticle", () => {
  it("returns the typed document when it exists", async () => {
    const article = makeArticle();
    getDoc.mockResolvedValue({ exists: () => true, data: () => article });
    await expect(getArticle("2026-06-01")).resolves.toEqual(article);
  });

  it("returns null when the document is absent", async () => {
    getDoc.mockResolvedValue({ exists: () => false, data: () => undefined });
    await expect(getArticle("2026-06-02")).resolves.toBeNull();
  });
});

describe("listRecentArticles", () => {
  it("maps snapshot docs to article data (newest-first query)", async () => {
    const a = makeArticle({ date: "2026-06-02" });
    const b = makeArticle({ date: "2026-06-01" });
    getDocs.mockResolvedValue({ docs: [{ data: () => a }, { data: () => b }] });
    const result = await listRecentArticles(30);
    expect(result).toEqual([a, b]);
  });
});
