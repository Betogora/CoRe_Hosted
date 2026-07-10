import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { AppErrorBoundary } from "./AppErrorBoundary.jsx";
import "./styles.css";

function ApplicationRoot() {
  if (import.meta.env.MODE === "e2e" && new URLSearchParams(window.location.search).get("core_e2e_render_error") === "1") {
    throw new Error("core_e2e_render_error");
  }

  return <App />;
}

createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <ApplicationRoot />
  </AppErrorBoundary>,
);
