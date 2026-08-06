import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { AppErrorBoundary } from "./AppErrorBoundary.tsx";
import { initializeCoreTheme } from "./coreTheme.ts";
import { SuccessToastProvider } from "./ui/feedbackUi.tsx";
import { CoreTooltipProvider } from "./ui/tooltipUi.tsx";
import "./styles.css";

initializeCoreTheme();

function ApplicationRoot() {
  if (import.meta.env.MODE === "e2e" && new URLSearchParams(window.location.search).get("core_e2e_render_error") === "1") {
    throw new Error("core_e2e_render_error");
  }

  return <App />;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("CoRe-Rootelement fehlt.");

createRoot(rootElement).render(
  <AppErrorBoundary>
    <CoreTooltipProvider>
      <SuccessToastProvider>
        <ApplicationRoot />
      </SuccessToastProvider>
    </CoreTooltipProvider>
  </AppErrorBoundary>,
);
