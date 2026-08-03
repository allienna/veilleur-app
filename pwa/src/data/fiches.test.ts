import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiche } from "@/test/fixtures";

// Avoid initializing a real Firebase app in tests.
vi.mock("@/firebase", () => ({ db: {} }));

const getDoc = vi.fn();
const getDocs = vi.fn();
const where = vi.fn((field: string, op: string, value: unknown) => ({ _where: [field, op, value] }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => getDoc(...args),
  getDocs: (...args: unknown[]) => getDocs(...args),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  where: (...args: [string, string, unknown]) => where(...args),
}));

import { getFiche, listFichesForArticle } from "@/data/fiches";

beforeEach(() => {
  getDoc.mockReset();
  getDocs.mockReset();
  where.mockClear();
});

describe("getFiche", () => {
  it("returns the typed document when it exists", async () => {
    const fiche = makeFiche();
    getDoc.mockResolvedValue({ exists: () => true, data: () => fiche });
    await expect(getFiche("une-source")).resolves.toEqual(fiche);
  });

  it("returns null when the document is absent", async () => {
    getDoc.mockResolvedValue({ exists: () => false, data: () => undefined });
    await expect(getFiche("absente")).resolves.toBeNull();
  });
});

describe("listFichesForArticle", () => {
  it("queries used_in with array-contains for the given date", async () => {
    getDocs.mockResolvedValue({ docs: [] });
    await listFichesForArticle("2026-06-01");
    expect(where).toHaveBeenCalledWith("used_in", "array-contains", "2026-06-01");
  });

  it("maps snapshot docs to fiche data", async () => {
    const a = makeFiche({ slug: "a" });
    const b = makeFiche({ slug: "b" });
    getDocs.mockResolvedValue({ docs: [{ data: () => a }, { data: () => b }] });
    const result = await listFichesForArticle("2026-06-01");
    expect(result).toEqual([a, b]);
  });
});
