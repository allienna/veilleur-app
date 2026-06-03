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
      manifest: {
        name: "Le Veilleur",
        short_name: "Veilleur",
        description: "Veille tech quotidienne — lecture et supervision.",
        lang: "fr",
        display: "standalone",
        background_color: "#f8f7f5",
        theme_color: "#f59f0a",
        start_url: "/",
        // Scalable SVG icon (any + maskable). A raster apple-touch-icon.png for older
        // iOS home-screen polish is a follow-up asset task (see pwa/README).
        icons: [
          { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            // Today/History article documents read from Firestore (FR-5 offline).
            urlPattern: ({ url }) => url.hostname === "firestore.googleapis.com",
            handler: "NetworkFirst",
            options: {
              cacheName: "veilleur-firestore",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Hero images served from the public Astro site.
            urlPattern: ({ url }) => url.hostname === "allienna.github.io",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "veilleur-hero-images",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
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
