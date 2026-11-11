import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, searchForWorkspaceRoot, type HtmlTagDescriptor, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { FEATURE_CHUNKS_ELEMENT_ID } from "./src/appFeaturePreload.ts";

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

interface PreloadableChunk {
  type: string;
  fileName: string;
  facadeModuleId?: string | null;
  imports?: string[];
}

/**
 * The session check needs the Supabase client before anything else; as a dynamic chunk it would only start
 * loading after the first render. Preloading it with the entry overlaps its download with the app bundle.
 */
export function sessionClientPreloadTags(bundle: Record<string, PreloadableChunk>, html: string, base = "/"): HtmlTagDescriptor[] {
  const client = Object.values(bundle).find((chunk) => chunk.type === "chunk" && String(chunk.facadeModuleId ?? "").replaceAll("\\", "/").endsWith("/src/supabaseClient.ts"));
  if (!client) return [];
  return [...(client.imports ?? []), client.fileName]
    .filter((fileName) => !html.includes(fileName))
    .map((fileName) => ({ tag: "link", attrs: { rel: "modulepreload", crossorigin: true, href: `${base}${fileName}` }, injectTo: "head" }));
}

function preloadSessionClient(): Plugin {
  let base = "/";
  return {
    name: "core-preload-session-client",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler: (html, context) => context.bundle ? sessionClientPreloadTags(context.bundle as unknown as Record<string, PreloadableChunk>, html, base) : [],
    },
  };
}

interface FeatureChunk {
  type: string;
  fileName: string;
  name?: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  code?: string;
}

/** Largest single file a feature's sub-areas prefetch; heavier ones (PDF, charts, formulas) load only when used. */
export const FEATURE_PART_MAX_BYTES = 80_000;

/**
 * For each chunk the start graph imports dynamically (the app's screens), its own files beyond the start graph and
 * the files of the sub-areas it imports dynamically. The client downloads them ahead without running them.
 */
export function featureChunkMap(bundle: Record<string, FeatureChunk>) {
  const chunks = new Map(Object.values(bundle).filter((chunk) => chunk.type === "chunk").map((chunk) => [chunk.fileName, chunk]));
  const closure = (files: Iterable<string>, collected = new Set<string>()) => {
    for (const file of files) {
      const chunk = chunks.get(file);
      if (!chunk || collected.has(file)) continue;
      collected.add(file);
      closure(chunk.imports ?? [], collected);
    }
    return collected;
  };
  const dynamicImportsOf = (files: Iterable<string>) => [...files].flatMap((file) => chunks.get(file)?.dynamicImports ?? []);
  const start = closure([...chunks.values()].filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName));
  return Object.fromEntries([...new Set(dynamicImportsOf(start))].filter((file) => !start.has(file)).map((file) => {
    // The start graph is loaded already; walking into it would add every screen it imports dynamically.
    const own = [...closure([file], new Set(start))].filter((ownFile) => !start.has(ownFile));
    const loaded = new Set([...start, ...own]);
    return [chunks.get(file)?.name ?? file, {
      files: own,
      parts: [...closure(dynamicImportsOf(own), new Set(loaded))].filter((part) => !loaded.has(part) && (chunks.get(part)?.code?.length ?? 0) <= FEATURE_PART_MAX_BYTES),
    }];
  }));
}

function listFeatureChunks(): Plugin {
  return {
    name: "core-feature-chunks",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (_html, context) => context.bundle ? [{
        tag: "script",
        attrs: { type: "application/json", id: FEATURE_CHUNKS_ELEMENT_ID },
        children: JSON.stringify(featureChunkMap(context.bundle as unknown as Record<string, FeatureChunk>)).replaceAll("<", "\\u003c"),
        injectTo: "body",
      }] : [],
    },
  };
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
        if (path !== "/api/ai/summary" && path !== "/api/ai/card-variant" && path !== "/api/ai/card-help") { next(); return; }
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
  plugins: [react(), preloadSessionClient(), listFeatureChunks(), localAiRoutes()],
  resolve: {
    // CoRe uses no Realtime channels; the stub keeps the WebSocket client (about 15 KiB gzip) out of the start graph.
    alias: [{ find: /^@supabase\/realtime-js$/, replacement: fileURLToPath(new URL("./src/supabaseRealtimeStub.ts", import.meta.url)) }],
  },
  worker: {
    format: "es",
  },
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: true,
    // Worktrees link node_modules to the main checkout; without its real path the dev server refuses files loaded by
    // URL, such as the PDF worker.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync(fileURLToPath(new URL("./node_modules", import.meta.url)))] },
  },
  preview: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: true,
  },
});
