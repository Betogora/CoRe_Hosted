import assert from "node:assert/strict";
import test from "node:test";
import { manualChunkForModule, resolveReleaseInfo } from "../vite.config.ts";
import { normalizeAppRuntimeInfo } from "./appRuntime.ts";

test("release info exposes only the package version", () => {
  assert.deepEqual(resolveReleaseInfo(), { version: "0.2.0" });
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
  assert.equal(manualChunkForModule("C:/repo/src/cloudRepository.ts"), undefined);
  assert.equal(manualChunkForModule("C:/repo/src/mediaStore.ts"), undefined);
  assert.equal(manualChunkForModule("C:/repo/node_modules/lucide-react/dist/index.js"), undefined);
  assert.equal(manualChunkForModule("C:\\repo\\src\\App.tsx"), undefined);
});
