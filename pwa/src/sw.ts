/// <reference lib="webworker" />
// Custom service worker (F-012 AD-3, injectManifest strategy). Owns three concerns:
//   1. App-shell precache (was workbox.globPatterns) — offline cold-open (F-009 AC-10).
//   2. Hero-image runtime cache (was workbox.runtimeCaching) — Astro-site images.
//   3. Web Push: `push` renders the notification, `notificationclick` focuses/opens the PWA.
// Article-document offline reads stay on Firestore's IndexedDB cache (src/firebase.ts), not here.
// The push/notificationclick LOGIC lives in src/lib/pushHandlers.ts (unit-tested under jsdom);
// this file is the thin event wiring, type-checked via tsconfig.worker.json (WebWorker lib).
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute, type PrecacheEntry } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";

import { clickTarget, showPush } from "@/lib/pushHandlers";

declare const self: ServiceWorkerGlobalScope & {
  // Injected by vite-plugin-pwa's injectManifest at build time.
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// Injected by vite-plugin-pwa (injectManifest.globPatterns). The app shell + static assets.
precacheAndRoute(self.__WB_MANIFEST);

// Hero images served from the public Astro site (GET, cacheable). Same cacheName/expiration as
// the former generateSW runtimeCaching entry so the offline behaviour is unchanged.
registerRoute(
  ({ url }) => url.hostname === "allienna.github.io",
  new StaleWhileRevalidate({
    cacheName: "veilleur-hero-images",
    plugins: [new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// --- Web Push (F-012 FR-4) ---------------------------------------------------------------

self.addEventListener("push", (event: PushEvent) => {
  event.waitUntil(showPush(event.data, self.registration));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const target = clickTarget(event.notification.data);
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Prefer a window already on the target route; otherwise reuse any open window; else open one.
      const onTarget = clientList.find((c) => c.url.endsWith(target));
      if (onTarget) {
        await onTarget.focus();
        return;
      }
      const [first] = clientList;
      if (first) {
        await first.focus();
        await first.navigate(target).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
