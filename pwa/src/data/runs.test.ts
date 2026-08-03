import { beforeEach, describe, expect, it, vi } from "vitest";

// Avoid initializing a real Firebase app in tests.
vi.mock("@/firebase", () => ({ db: {} }));

// Control the Firestore SDK surface the repo uses. `onSnapshot` records its (success, error)
// callbacks per call so the test can drive doc-first / steps-first orderings by hand.
const getDocs = vi.fn();
const snapCallbacks: { next: (s: unknown) => void; error?: (e: Error) => void }[] = [];
const unsubs: ReturnType<typeof vi.fn>[] = [];
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  documentId: vi.fn(() => "__name__"),
  getDocs: (...args: unknown[]) => getDocs(...args),
  limit: vi.fn((n: number) => ({ _limit: n })),
  onSnapshot: (_ref: unknown, next: (s: unknown) => void, error?: (e: Error) => void) => {
    snapCallbacks.push({ next, error });
    const unsub = vi.fn();
    unsubs.push(unsub);
    return unsub;
  },
  orderBy: vi.fn((f: string, d: string) => ({ _orderBy: [f, d] })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
}));

import { assembleRun, listRecentRuns, STEP_ORDER, subscribeRun } from "@/data/runs";

const runDoc = { runId: "01J0", status: "running", startedAt: "2026-06-01T06:00:00Z" };
const stepDoc = (name: string, status = "success") => ({ name, status });

beforeEach(() => {
  getDocs.mockReset();
  snapCallbacks.length = 0;
  unsubs.length = 0;
});

describe("assembleRun", () => {
  it("renders all present steps in canonical order regardless of input order", () => {
    const run = assembleRun("2026-06-01", runDoc, [
      stepDoc("generate"),
      stepDoc("gmail"),
      stepDoc("jina"),
    ]);
    expect(run?.steps.map((s) => s.name)).toEqual(["gmail", "jina", "generate"]);
  });

  it("omits not-yet-started steps (timeline fills the gaps as pending)", () => {
    const run = assembleRun("2026-06-01", runDoc, [stepDoc("gmail")]);
    expect(run?.steps).toHaveLength(1);
    expect(STEP_ORDER).toHaveLength(10);
  });

  it("returns null when the run document is absent", () => {
    expect(assembleRun("2026-06-01", undefined, [])).toBeNull();
  });

  it("defaults cost/tokens/error to null when unset", () => {
    const run = assembleRun("2026-06-01", runDoc, []);
    expect(run?.costUsd).toBeNull();
    expect(run?.tokens).toBeNull();
    expect(run?.error).toBeNull();
  });

  it("carries cost/tokens through when present", () => {
    const run = assembleRun("2026-06-01", { ...runDoc, costUsd: 0.42, tokens: 1200 }, []);
    expect(run?.costUsd).toBe(0.42);
    expect(run?.tokens).toBe(1200);
  });
});

describe("subscribeRun", () => {
  it("waits for the run doc before emitting, even if steps arrive first", () => {
    const cb = vi.fn();
    subscribeRun("2026-06-01", cb);
    // [0] = run doc listener, [1] = steps listener (registration order in subscribeRun).
    const [runListener, stepsListener] = snapCallbacks;

    stepsListener.next({ docs: [{ data: () => stepDoc("gmail") }] });
    expect(cb).not.toHaveBeenCalled(); // no run doc yet

    runListener.next({ exists: () => true, data: () => runDoc });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].steps.map((s: { name: string }) => s.name)).toEqual(["gmail"]);
  });

  it("emits null when the run doc does not exist", () => {
    const cb = vi.fn();
    subscribeRun("2026-06-01", cb);
    snapCallbacks[0].next({ exists: () => false, data: () => undefined });
    expect(cb).toHaveBeenCalledWith(null);
  });

  it("tears down both listeners on unsubscribe", () => {
    const unsub = subscribeRun("2026-06-01", vi.fn());
    unsub();
    expect(unsubs).toHaveLength(2);
    for (const u of unsubs) expect(u).toHaveBeenCalledOnce();
  });

  it("forwards a listener error", () => {
    const onError = vi.fn();
    subscribeRun("2026-06-01", vi.fn(), onError);
    const err = new Error("permission-denied");
    snapCallbacks[0].error?.(err);
    expect(onError).toHaveBeenCalledWith(err);
  });
});

describe("listRecentRuns", () => {
  it("maps snapshot docs to runs (newest-first by document id)", async () => {
    getDocs.mockResolvedValue({
      docs: [
        { id: "2026-06-02", data: () => ({ ...runDoc, status: "success" }) },
        { id: "2026-06-01", data: () => ({ ...runDoc, status: "failure" }) },
      ],
    });
    const result = await listRecentRuns(7);
    expect(result.map((r) => r.date)).toEqual(["2026-06-02", "2026-06-01"]);
    expect(result[0].status).toBe("success");
  });
});
