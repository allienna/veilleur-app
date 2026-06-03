import type { Config } from "tailwindcss";

// DESIGN §1 design tokens. Colors resolve to CSS variables defined in src/index.css
// so light/dark (prefers-color-scheme) switch without duplicating the palette here.
// Do not invent tokens — this mirrors DESIGN.md §1 exactly.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "var(--bg-default)",
          elevated: "var(--bg-elevated)",
          inverted: "var(--bg-inverted)",
        },
        fg: {
          DEFAULT: "var(--fg-default)",
          muted: "var(--fg-muted)",
          inverted: "var(--fg-inverted)",
        },
        border: {
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
        primary: "var(--accent-primary)",
        navy: "var(--accent-navy)",
        success: "var(--semantic-success)",
        warning: "var(--semantic-warning)",
        error: "var(--semantic-error)",
        info: "var(--semantic-info)",
        neutral: "var(--semantic-neutral)",
        status: {
          success: "var(--status-success)",
          warning: "var(--status-warning)",
          error: "var(--status-error)",
          neutral: "var(--status-neutral)",
          muted: "var(--status-muted)",
          live: "var(--status-live)",
        },
      },
      fontFamily: {
        display: ['"Poppins"', "ui-sans-serif", "system-ui", "sans-serif"],
        body: ['"Work Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        display: ["32px", { lineHeight: "38px", fontWeight: "700" }],
        h1: ["28px", { lineHeight: "34px", fontWeight: "700" }],
        h2: ["22px", { lineHeight: "28px", fontWeight: "600" }],
        h3: ["18px", { lineHeight: "24px", fontWeight: "600" }],
        body: ["16px", { lineHeight: "24px" }],
        caption: ["13px", { lineHeight: "18px", fontWeight: "500" }],
        "mono-sm": ["13px", { lineHeight: "18px" }],
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
        "3xl": "64px",
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        full: "9999px",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
        emphasized: "cubic-bezier(0.3, 0, 0, 1.2)",
      },
      maxWidth: {
        reading: "48rem", // max-w-3xl reading container (DESIGN §3)
      },
    },
  },
  plugins: [],
};

export default config;
