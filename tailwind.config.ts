import type { Config } from "tailwindcss";

export default {
  content: {
    relative: true,
    files: ["./index.html", "./src/**/*.{ts,tsx}"],
  },
  theme: {
    extend: {
      borderRadius: {
        marker: "var(--core-radius-marker)",
        inset: "var(--core-radius-inset)",
        control: "var(--core-radius-control)",
        panel: "var(--core-radius-panel)",
        overlay: "var(--core-radius-overlay)",
        round: "var(--core-radius-round)",
      },
      boxShadow: {
        soft: "var(--core-shadow-soft)",
        raised: "var(--core-shadow-raised)",
        inset: "var(--core-shadow-inset)",
        selection: "var(--core-shadow-selection)",
      },
      borderWidth: {
        DEFAULT: "var(--core-border-width)",
        strong: "var(--core-border-width-strong)",
      },
      fontWeight: {
        normal: "var(--core-weight-body)",
        medium: "var(--core-weight-control)",
        semibold: "var(--core-weight-emphasis)",
        bold: "var(--core-weight-heading)",
      },
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
          hover: "var(--core-surface-hover)",
          text: "var(--core-text)",
          secondary: "var(--core-text-secondary)",
          muted: "var(--core-text-muted)",
          "on-accent": "var(--core-text-on-accent)",
          "on-danger": "var(--core-text-on-danger)",
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
