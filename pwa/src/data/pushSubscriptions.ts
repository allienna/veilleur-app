import type { PushSubscription as PushSubscriptionDoc } from "@veilleur/shared/push-subscription";
import { deleteDoc, doc, setDoc, type Firestore } from "firebase/firestore";

import { ALLOWED_OPERATOR_EMAIL, VAPID_PUBLIC_KEY } from "@/config";
import { db } from "@/firebase";

const COLLECTION = "pushSubscriptions";

/** Coarse opt-in state the `NotificationOptIn` control renders from (F-012 FR-2). */
export type PushState = "unsupported" | "denied" | "subscribed" | "unsubscribed";

/**
 * Injected seams so the flow is unit-testable without a browser (mirrors `trigger.ts`). The
 * defaults bind to the live Push API + Firestore.
 */
export interface PushDeps {
  /** True when the platform exposes the Push API. On iOS this is only true once the PWA is
   *  installed to the home screen (iOS 16.4+), which is what the UI guidance is about. */
  supported: () => boolean;
  /** Current Notification permission without prompting. */
  permission: () => NotificationPermission;
  /** Prompt for Notification permission. */
  requestPermission: () => Promise<NotificationPermission>;
  /** The active service-worker registration (navigator.serviceWorker.ready by default). */
  registration: () => Promise<ServiceWorkerRegistration>;
  db: Firestore;
  /** Operator email stamped on the doc for the Firestore ownership rule (AD-5). */
  operatorEmail: string;
  /** ISO timestamp for `createdAt`. */
  now: () => string;
}

function defaultDeps(): PushDeps {
  return {
    supported: () =>
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      typeof window !== "undefined" &&
      "PushManager" in window &&
      "Notification" in window,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    registration: () => navigator.serviceWorker.ready,
    db,
    operatorEmail: ALLOWED_OPERATOR_EMAIL,
    now: () => new Date().toISOString(),
  };
}

/** sha256(endpoint) as lowercase hex — the stable Firestore doc id (AD-4: re-subscribe upserts). */
async function endpointId(endpoint: string): Promise<string> {
  const bytes = new TextEncoder().encode(endpoint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Decode a base64url VAPID public key to the Uint8Array `applicationServerKey` expects. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Read the current opt-in state without prompting or subscribing. */
export async function currentState(deps: PushDeps = defaultDeps()): Promise<PushState> {
  if (!deps.supported()) return "unsupported";
  if (deps.permission() === "denied") return "denied";
  const reg = await deps.registration();
  const existing = await reg.pushManager.getSubscription();
  return existing ? "subscribed" : "unsubscribed";
}

/**
 * Enable notifications: prompt for permission, subscribe via PushManager, and upsert the
 * subscription doc at `pushSubscriptions/{sha256(endpoint)}` (FR-2/FR-3). Idempotent — an
 * existing subscription is reused, and the doc id is endpoint-derived so re-subscribe upserts.
 * Returns the resulting state; "denied"/"unsupported" create no subscription.
 */
export async function subscribe(deps: PushDeps = defaultDeps()): Promise<PushState> {
  if (!deps.supported()) return "unsupported";
  const permission = deps.permission() === "granted" ? "granted" : await deps.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "unsubscribed";

  const reg = await deps.registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("push subscription missing endpoint/keys");
  }
  const docData: PushSubscriptionDoc = {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    operatorEmail: deps.operatorEmail,
    createdAt: deps.now(),
  };
  await setDoc(doc(deps.db, COLLECTION, await endpointId(json.endpoint)), docData);
  return "subscribed";
}

/**
 * Disable notifications: unsubscribe from PushManager and delete the Firestore doc (FR-2).
 * Safe to call when not subscribed.
 */
export async function unsubscribe(deps: PushDeps = defaultDeps()): Promise<PushState> {
  if (!deps.supported()) return "unsupported";
  const reg = await deps.registration();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const id = await endpointId(sub.endpoint);
    await sub.unsubscribe();
    await deleteDoc(doc(deps.db, COLLECTION, id));
  }
  return "unsubscribed";
}
