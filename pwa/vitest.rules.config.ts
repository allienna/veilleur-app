import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Firestore Security Rules tests (AC-7). Run only under the Firestore emulator via
// `pnpm test:rules` (firebase emulators:exec). Node environment — no jsdom/DOM needed.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.rules.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
