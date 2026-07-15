import assert from "node:assert/strict";
import test from "node:test";
import { createProductSurfaceRegistry } from "./productSurfaces.ts";

test("classifies every product surface as core, labs, or disabled", () => {
  const registry = createProductSurfaceRegistry();
  const all = registry.list();

  assert.deepEqual(all.filter((surface) => surface.maturity === "core").map((surface) => surface.id), [
    "today",
    "learn",
    "creation-manual-import",
    "statistics",
    "settings",
  ]);
  assert.deepEqual(all.filter((surface) => surface.maturity === "labs").map((surface) => surface.id), [
    "assistant-chat",
    "learning-plan",
    "graph",
    "community-demo",
    "ai-job-history",
    "local-ai-drafts",
    "external-variant-json",
  ]);
  assert.deepEqual(all.filter((surface) => surface.maturity === "disabled").map((surface) => surface.id), [
    "server-apkg-over-250",
    "auth-google",
    "auth-magic-link",
  ]);
});

test("exposes labs only in development or explicit labs mode", () => {
  assert.equal(createProductSurfaceRegistry().isAvailable("graph"), false);
  assert.equal(createProductSurfaceRegistry({ DEV: true }).isAvailable("graph"), true);
  assert.equal(createProductSurfaceRegistry({ DEV: true, VITE_ENABLE_LABS: "false" }).isAvailable("graph"), false);
  assert.equal(createProductSurfaceRegistry({ VITE_ENABLE_LABS: "true" }).isAvailable("community-demo"), true);
  assert.equal(createProductSurfaceRegistry({ VITE_ENABLE_LABS: "0" }).isAvailable("assistant-chat"), false);
});

test("keeps the main navigation limited to the four core areas", () => {
  const registry = createProductSurfaceRegistry({ DEV: true });

  assert.deepEqual(registry.list().filter((surface) => registry.isMainNavigationVisible(surface.id)).map((surface) => surface.id), [
    "today",
    "learn",
    "creation-manual-import",
    "statistics",
  ]);
});

test("requires a dedicated release switch for disabled surfaces", () => {
  const defaultRegistry = createProductSurfaceRegistry({ DEV: true, VITE_ENABLE_LABS: "true" });
  assert.equal(defaultRegistry.isAvailable("server-apkg-over-250"), false);
  assert.equal(defaultRegistry.isAvailable("auth-google"), false);
  assert.equal(defaultRegistry.isAvailable("auth-magic-link"), false);

  const releasedRegistry = createProductSurfaceRegistry({
    VITE_ENABLE_SERVER_APKG_IMPORT: "1",
    VITE_ENABLE_GOOGLE_AUTH: "yes",
    VITE_ENABLE_MAGIC_LINK: true,
  });
  assert.equal(releasedRegistry.isAvailable("server-apkg-over-250"), true);
  assert.equal(releasedRegistry.isAvailable("auth-google"), true);
  assert.equal(releasedRegistry.isAvailable("auth-magic-link"), true);
});
