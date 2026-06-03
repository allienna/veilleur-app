import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/firebase", () => ({ db: { __fake: true } }));
vi.mock("@/config", () => ({
  ALLOWED_OPERATOR_EMAIL: "aurelien.allienne@gmail.com",
  // A realistic-shape VAPID public key (base64url, 87 chars) so urlBase64ToUint8Array decodes.
  VAPID_PUBLIC_KEY:
    "BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo4M0gs0i1oEKgPpWC5cW8OCzVrOQRv-1fzMHfktDsdyHHd9eVfvxbBO4",
}));

const setDoc = vi.fn();
const deleteDoc = vi.fn();
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ collection, id }),
  setDoc: (ref: unknown, data: unknown) => setDoc(ref, data),
  deleteDoc: (ref: unknown) => deleteDoc(ref),
}));

import { currentState, subscribe, unsubscribe, type PushDeps } from "@/data/pushSubscriptions";

const ENDPOINT = "https://push.example/abc123";
const subJson = { endpoint: ENDPOINT, keys: { p256dh: "p256", auth: "authsecret" } };

function makeSubscription(overrides: Partial<PushSubscription> = {}): PushSubscription {
  return {
    endpoint: ENDPOINT,
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => subJson,
    ...overrides,
  } as unknown as PushSubscription;
}

function makeDeps(over: Partial<PushDeps> = {}): PushDeps {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(makeSubscription()),
  };
  return {
    supported: () => true,
    permission: () => "default",
    requestPermission: vi.fn().mockResolvedValue("granted"),
    registration: vi.fn().mockResolvedValue({ pushManager } as unknown as ServiceWorkerRegistration),
    db: { __fake: true } as never,
    operatorEmail: "aurelien.allienne@gmail.com",
    now: () => "2026-06-03T06:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  setDoc.mockClear();
  deleteDoc.mockClear();
});

describe("subscribe", () => {
  it("prompts, subscribes, and upserts the doc with operatorEmail + endpoint-hash id", async () => {
    const deps = makeDeps();
    const state = await subscribe(deps);
    expect(state).toBe("subscribed");
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = setDoc.mock.calls[0];
    expect(ref.collection).toBe("pushSubscriptions");
    expect(ref.id).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(data).toMatchObject({
      endpoint: ENDPOINT,
      keys: { p256dh: "p256", auth: "authsecret" },
      operatorEmail: "aurelien.allienne@gmail.com",
      createdAt: "2026-06-03T06:00:00.000Z",
    });
  });

  it("upserts to the SAME id when re-subscribing the same endpoint (no duplicate)", async () => {
    const first = await subscribe(makeDeps());
    const id1 = setDoc.mock.calls[0][0].id;
    setDoc.mockClear();
    // Second time: an existing subscription is already present; reuse it, don't re-subscribe.
    const existing = makeSubscription();
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(existing),
      subscribe: vi.fn(),
    };
    await subscribe(
      makeDeps({
        permission: () => "granted",
        registration: vi.fn().mockResolvedValue({ pushManager } as never),
      }),
    );
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(setDoc.mock.calls[0][0].id).toBe(id1);
    expect(first).toBe("subscribed");
  });

  it("returns 'denied' and writes nothing when permission is refused", async () => {
    const deps = makeDeps({ requestPermission: vi.fn().mockResolvedValue("denied") });
    expect(await subscribe(deps)).toBe("denied");
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("returns 'unsupported' (no prompt, no write) when the Push API is absent", async () => {
    const requestPermission = vi.fn();
    expect(await subscribe(makeDeps({ supported: () => false, requestPermission }))).toBe(
      "unsupported",
    );
    expect(requestPermission).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe("unsubscribe", () => {
  it("unsubscribes and deletes the doc when a subscription exists", async () => {
    const existing = makeSubscription();
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(existing),
      subscribe: vi.fn(),
    };
    const state = await unsubscribe(
      makeDeps({ registration: vi.fn().mockResolvedValue({ pushManager } as never) }),
    );
    expect(state).toBe("unsubscribed");
    expect(existing.unsubscribe).toHaveBeenCalled();
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it("is a no-op delete when there is no subscription", async () => {
    expect(await unsubscribe(makeDeps())).toBe("unsubscribed");
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});

describe("currentState", () => {
  it("reports 'subscribed' when a subscription is present", async () => {
    const pushManager = { getSubscription: vi.fn().mockResolvedValue(makeSubscription()) };
    expect(
      await currentState(
        makeDeps({ registration: vi.fn().mockResolvedValue({ pushManager } as never) }),
      ),
    ).toBe("subscribed");
  });

  it("reports 'denied' without touching the registration", async () => {
    const registration = vi.fn();
    expect(await currentState(makeDeps({ permission: () => "denied", registration }))).toBe(
      "denied",
    );
    expect(registration).not.toHaveBeenCalled();
  });

  it("reports 'unsupported' when the Push API is absent", async () => {
    expect(await currentState(makeDeps({ supported: () => false }))).toBe("unsupported");
  });
});
