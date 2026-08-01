import type { Config } from "tailwindcss";

export default {
  content: {
    relative: true,
    files: ["./index.html", "./src/**/*.{ts,tsx}"],
  },
  theme: {
    extend: {
      fontFamily: {
        display: ["Amulya", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Synonym", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        core: {
          canvas: "var(--core-canvas)",
          surface: "var(--core-surface)",
          raised: "var(--core-surface-raised)",
          subtle: "var(--core-surface-muted)",
          text: "var(--core-text)",
          secondary: "var(--core-text-secondary)",
          muted: "var(--core-text-muted)",
          border: "var(--core-border)",
          "border-strong": "var(--core-border-interactive)",
          action: "var(--core-action-primary)",
          "action-hover": "var(--core-action-primary-hover)",
          "action-active": "var(--core-action-primary-active)",
          focus: "var(--core-focus)",
          info: "var(--core-info)",
          success: "var(--core-success)",
          warning: "var(--core-warning)",
          danger: "var(--core-danger)",
          "info-soft": "var(--core-info-surface)",
          "success-soft": "var(--core-success-surface)",
          "warning-soft": "var(--core-warning-surface)",
          "danger-soft": "var(--core-danger-surface)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
