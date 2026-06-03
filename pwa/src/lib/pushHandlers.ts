// Pure, environment-agnostic Web Push handler logic (F-012 FR-4), extracted from the service
// worker so it is unit-testable under jsdom. `sw.ts` wires these to the real `push` /
// `notificationclick` events (which carry WebWorker-lib types absent here).

/** Payload the Minion sends (notify/webpush.py). `url` is the in-app deep-link target. */
export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

const FALLBACK: PushPayload = { title: "Le Veilleur", body: "Mise à jour disponible." };

/** Minimal shape of `PushEvent.data` — duck-typed so this module needs no WebWorker lib. */
export interface PushMessageDataLike {
  json(): unknown;
  text(): string;
}

/** Parse the push message into a payload, degrading gracefully on missing/non-JSON data. */
export function parsePayload(data: PushMessageDataLike | null): PushPayload {
  if (!data) return FALLBACK;
  try {
    const parsed = data.json() as Partial<PushPayload>;
    return {
      title: parsed.title ?? FALLBACK.title,
      body: parsed.body ?? FALLBACK.body,
      url: parsed.url,
    };
  } catch {
    return { title: FALLBACK.title, body: data.text() || FALLBACK.body };
  }
}

/** Notification options for a payload — icon/badge/tag plus the deep-link in `data.url`. */
export function notificationOptions(payload: PushPayload): {
  body: string;
  icon: string;
  badge: string;
  data: { url: string };
  tag: string;
} {
  return {
    body: payload.body,
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg",
    data: { url: payload.url ?? "/" },
    tag: "veilleur-run", // collapse repeated run notifications into one
  };
}

/** Render the notification for a push event. `reg` is the SW registration. */
export function showPush(
  data: PushMessageDataLike | null,
  reg: { showNotification(title: string, options: ReturnType<typeof notificationOptions>): Promise<void> },
): Promise<void> {
  const payload = parsePayload(data);
  return reg.showNotification(payload.title, notificationOptions(payload));
}

/** Resolve the in-app URL a clicked notification should open (defaults to "/"). */
export function clickTarget(notificationData: unknown): string {
  const url = (notificationData as { url?: string } | undefined)?.url;
  return typeof url === "string" && url.length > 0 ? url : "/";
}
