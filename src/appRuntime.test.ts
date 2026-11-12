import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { FEATURE_PART_MAX_BYTES, featureChunkMap, manualChunkForModule, resolveReleaseInfo, sessionClientPreloadTags } from "../vite.config.ts";
import { normalizeAppRuntimeInfo } from "./appRuntime.ts";

test("release info exposes only the package version", () => {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(resolveReleaseInfo(), { version });
  assert.deepEqual(resolveReleaseInfo({ version: "1.2.3-beta.1" }), { version: "1.2.3-beta.1" });
});

test("runtime info normalizes only the version and ignores extra input fields", () => {
  assert.deepEqual(
    normalizeAppRuntimeInfo({
      version: "<script>",
      commit: "secret-token",
      environment: "private-production-name",
      providerSecret: "must-not-appear",
    }),
    { version: "0.0.0" },
  );
  assert.deepEqual(normalizeAppRuntimeInfo({
    version: "0.2.0",
    commit: "abcdef123456",
    environment: "production",
    rawPrompt: "must-not-appear",
  }), { version: "0.2.0" });
});

test("build chunking isolates React and Supabase without inventing broad vendor buckets", () => {
  assert.equal(manualChunkForModule("C:/repo/node_modules/react-dom/client.js"), "react-vendor");
  assert.equal(manualChunkForModule("C:/repo/node_modules/@supabase/auth-js/index.js"), "supabase-vendor");
  assert.equal(manualChunkForModule("C:/repo/node_modules/ts-fsrs/dist/index.js"), "scheduler-vendor");
  assert.equal(manualChunkForModule("C:/repo/node_modules/xss/dist/xss.js"), "html-safety-vendor");
  assert.equal(manualChunkForModule("C:/repo/src/indexedDbCoreRepository.ts"), "local-persistence");
  assert.equal(manualChunkForModule("C:/repo/src/indexedDbCardBodies.ts"), "local-persistence");
  assert.equal(manualChunkForModule("C:/repo/src/indexedDbStore.ts"), undefined);
  assert.equal(manualChunkForModule("C:/repo/src/cloudRepository.ts"), undefined);
  assert.equal(manualChunkForModule("C:/repo/src/mediaStore.ts"), undefined);
  assert.equal(manualChunkForModule("C:/repo/node_modules/lucide-react/dist/index.js"), undefined);
  assert.equal(manualChunkForModule("C:\\repo\\src\\App.tsx"), undefined);
});

test("the entry preloads the Supabase client chunk for the session check", () => {
  const bundle = {
    "assets/index.js": { type: "chunk", fileName: "assets/index.js", facadeModuleId: "/app/src/main.tsx", imports: [] },
    "assets/supabaseClient.js": { type: "chunk", fileName: "assets/supabaseClient.js", facadeModuleId: "/app/src/supabaseClient.ts", imports: ["assets/supabase-vendor.js", "assets/index.js"] },
  };
  assert.deepEqual(
    sessionClientPreloadTags(bundle, '<script type="module" src="/assets/index.js"></script>').map((tag) => tag.attrs?.href),
    ["/assets/supabase-vendor.js", "/assets/supabaseClient.js"],
  );
  assert.deepEqual(sessionClientPreloadTags({}, ""), []);
});

test("die Chunkliste nennt je Bildschirm seine Dateien außerhalb des Startgraphen und seine kleinen Unterbereiche", () => {
  const chunk = (fileName: string, extra: Record<string, unknown> = {}) => ({ type: "chunk", fileName, code: "x", ...extra });
  const bundle = {
    "index.js": chunk("index.js", { isEntry: true, imports: ["vendor.js"], dynamicImports: ["Decks.js", "Learn.js"] }),
    "vendor.js": chunk("vendor.js"),
    // Importing the entry must not make the entry's other screens parts of this one.
    "Decks.js": chunk("Decks.js", { name: "DecksScreen", imports: ["index.js", "shared.js"], dynamicImports: ["Summary.js", "Pdf.js"] }),
    "Learn.js": chunk("Learn.js", { name: "LearnScreen", imports: ["shared.js"] }),
    "shared.js": chunk("shared.js"),
    "Summary.js": chunk("Summary.js", { imports: ["shared.js", "editor.js"] }),
    "editor.js": chunk("editor.js"),
    "Pdf.js": chunk("Pdf.js", { code: "x".repeat(FEATURE_PART_MAX_BYTES + 1) }),
    "index.css": { type: "asset", fileName: "index.css" },
  };
  assert.deepEqual(featureChunkMap(bundle), {
    DecksScreen: { files: ["Decks.js", "shared.js"], parts: ["Summary.js", "editor.js"] },
    LearnScreen: { files: ["Learn.js", "shared.js"], parts: [] },
  });
});
