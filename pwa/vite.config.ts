import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// PWA service-worker + manifest wiring (vite-plugin-pwa) lands in F-009.
export default defineConfig({
  plugins: [react()],
});
