import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export function manualChunkForModule(moduleId = "") {
  const id = String(moduleId).replaceAll("\\", "/");
  if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
  if (id.includes("/node_modules/@supabase/")) return "supabase-vendor";
  if (id.includes("/node_modules/ts-fsrs/")) return "scheduler-vendor";
  if (id.includes("/node_modules/xss/")) return "html-safety-vendor";
  if (/\/src\/indexedDbCoreRepository\.ts$/.test(id)) return "local-persistence";
  return undefined;
}

export function resolveReleaseInfo({ version = packageJson.version } = {}) {
  return { version };
}

export default defineConfig({
  cacheDir: process.env.CORE_VITE_CACHE_DIR || undefined,
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: manualChunkForModule,
        onlyExplicitManualChunks: true,
      },
    },
  },
  define: {
    __CORE_RELEASE_INFO__: JSON.stringify(resolveReleaseInfo()),
  },
  plugins: [react()],
  worker: {
    format: "es",
  },
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: true,
  },
});
