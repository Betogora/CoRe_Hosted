import { readFileSync } from "node:fs";
import { defineConfig, loadEnv, type Plugin } from "vite";
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

function localAiRoutes(): Plugin {
  return {
    name: "core-local-ai-routes",
    apply: "serve",
    configResolved(config) {
      const local = loadEnv(config.mode, config.root, ["OPENROUTER_", "SUPABASE_", "VITE_SUPABASE_"]);
      for (const name of ["OPENROUTER_API_KEY", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]) {
        if (process.env[name] === undefined && local[name] !== undefined) process.env[name] = local[name];
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/api/ai/summary" && path !== "/api/ai/card-variant") { next(); return; }
        void server.ssrLoadModule(`${path}.ts`).then((module) => module.default(req, res)).catch(() => {
          if (res.writableEnded) return;
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "private, no-store");
          res.end(JSON.stringify({ error: { code: "local_api_error", message: "Die lokale KI-Route konnte nicht geladen werden." } }));
        });
      });
    },
  };
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
  plugins: [react(), localAiRoutes()],
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
