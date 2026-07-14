import { defineConfig } from "@trigger.dev/sdk";

const project = process.env.TRIGGER_PROJECT_REF;
if (!project) throw new Error("TRIGGER_PROJECT_REF fehlt für Trigger.dev.");

export default defineConfig({
  project,
  dirs: ["./trigger"],
  runtime: "node-22",
  machine: "large-1x",
  maxDuration: 3_600,
  retries: { enabledInDev: false },
});
