import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/firebase", () => ({ auth: { currentUser: null } }));
vi.mock("@/config", () => ({ TRIGGER_API_URL: "https://trigger.test" }));
vi.mock("firebase/auth", () => ({ getIdToken: vi.fn() }));

import { triggerRun, TriggerError } from "@/data/trigger";

const ok = (date: string) => ({
  status: 202,
  json: async () => ({ date, execution: "exec-1" }),
});

const deps = (fetchImpl: ReturnType<typeof vi.fn>) => ({
  token: async () => "jwt-123",
  fetch: fetchImpl as unknown as typeof fetch,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
});

describe("triggerRun", () => {
  it("POSTs to /trigger with the Bearer token and returns the run date on 202", async () => {
    fetchMock.mockResolvedValue(ok("2026-06-03"));
    const date = await triggerRun(undefined, deps(fetchMock));
    expect(date).toBe("2026-06-03");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://trigger.test/trigger");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer jwt-123");
    expect(init.body).toBe("{}");
  });

  it("sends an explicit date in the body when provided", async () => {
    fetchMock.mockResolvedValue(ok("2026-06-01"));
    await triggerRun("2026-06-01", deps(fetchMock));
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ date: "2026-06-01" }));
  });

  it.each([401, 403, 500])("throws TriggerError carrying status %i", async (status) => {
    fetchMock.mockResolvedValue({ status, json: async () => ({}) });
    await expect(triggerRun(undefined, deps(fetchMock))).rejects.toMatchObject({
      name: "TriggerError",
      status,
    });
    await expect(triggerRun(undefined, deps(fetchMock))).rejects.toBeInstanceOf(TriggerError);
  });
});
