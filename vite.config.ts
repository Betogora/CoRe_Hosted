import { readFileSync } from "node:fs";
import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";
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
  plugins: [react(), preloadSessionClient()],
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
