import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { configDefaults, defineConfig } from "vitest/config";

// React + service-worker/manifest (vite-plugin-pwa, F-009 AD-6) + Vitest.
// The manifest enables iOS home-screen install (FR-1); theme/background colors
// are the DESIGN §1 brand tokens (accent.primary on bg.default).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest (F-012 AD-3): we own the service worker (src/sw.ts) because a Web Push
      // handler is custom SW code that generateSW cannot host. The app-shell precache and the
      // hero-image runtime cache (previously the `workbox` block) now live in src/sw.ts.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      manifest: {
        name: "Le Veilleur",
        short_name: "Veilleur",
        description: "Veille tech quotidienne — lecture et supervision.",
        lang: "fr",
        display: "standalone",
        background_color: "#f8f7f5",
        theme_color: "#f59f0a",
        start_url: "/",
        // Scalable SVG icons: `icon.svg` (rounded square, browsers that render the manifest icon
        // as-is) and `icon-maskable.svg` (full-bleed, safe-zone-respecting — Android etc. apply
        // their own mask/crop). `apple-touch-icon.png` (index.html) is separate: iOS doesn't
        // accept SVG there.
        icons: [
          { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          {
            src: "/icons/icon-maskable.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        // App-shell precache glob — injected as self.__WB_MANIFEST into src/sw.ts. Mirrors the
        // former workbox.globPatterns. Article-document offline reads are handled by Firestore's
        // IndexedDB persistentLocalCache (see src/firebase.ts), not Workbox.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Rules tests need the Firestore emulator; run them via `pnpm test:rules`.
    exclude: [...configDefaults.exclude, "**/*.rules.test.ts"],
  },
});
