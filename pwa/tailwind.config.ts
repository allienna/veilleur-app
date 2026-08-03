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
          // Article prose tones — see index.css. `body` is for paragraphs and list items,
          // `quote` for pull quotes; headings and `strong` stay on `fg.DEFAULT`.
          body: "var(--fg-body)",
          quote: "var(--fg-quote)",
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
        // Alias `sans` to the body face, as the Astro config does. Tailwind's preflight sets
        // `html { font-family: theme(fontFamily.sans) }`, so leaving it at the default put the
        // system stack (SF Pro on macOS) one inherit away from any element that isn't covered by
        // `body`, and made a bare `font-sans` silently wrong.
        sans: ['"Work Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
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
        // Editorial scale — reader surface only (DESIGN §1 "Editorial scale"), ported 1:1 from
        // ../veilleur/site's ArticleLayout.astro so an article reads the same on both surfaces.
        "article-title": ["36px", { lineHeight: "1.1", fontWeight: "900" }],
        "article-title-lg": ["60px", { lineHeight: "1.1", fontWeight: "900" }],
        // `1.625` is Astro's `leading-relaxed` on the prose wrapper, which both the lead and body
        // paragraphs inherit — as a ratio, not a rounded px value.
        "article-lead": ["20px", { lineHeight: "1.625", fontWeight: "300" }],
        "article-body": ["18px", { lineHeight: "1.625" }],
        "article-h2": ["30px", { lineHeight: "36px", fontWeight: "700" }],
        "article-h3": ["24px", { lineHeight: "32px", fontWeight: "700" }],
        "article-quote": ["24px", { lineHeight: "32px", fontWeight: "300" }],
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
        "3xl": "64px",
        "4xl": "96px", // article card's overlap onto the hero (Astro `-mt-24`)
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "24px", // article card top edge (Astro `rounded-t-3xl`)
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
        reading: "800px", // article column, same as the Astro site's `max-w-[800px]` (DESIGN §3)
      },
    },
  },
  plugins: [],
};

export default config;
