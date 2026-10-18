import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { registerAppModuleLoadErrors, registerCoreServiceWorker } from "./pwa.ts";

const origin = "https://core.example";
const workerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function worker({ cached, response, offline = false }: { cached?: Response; response?: Response; offline?: boolean } = {}) {
  const listeners = new Map<string, (event: unknown) => void>();
  const stored: Array<{ key: unknown; response: Response }> = [];
  const cache = { put: async (key: unknown, response: Response) => { stored.push({ key, response }); } };
  let fetches = 0;
  runInNewContext(workerSource, {
    self: { location: { origin }, addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener) },
    caches: {
      match: async () => cached,
      open: async () => cache,
    },
    fetch: async () => { fetches++; if (offline) throw new TypeError("Offline"); return response; },
    URL, Response,
  });
  return {
    stored,
    get fetches() { return fetches; },
    fetch: (path: string, mode = "cors") => {
      let result: Promise<Response> | undefined;
      listeners.get("fetch")!({ request: { url: `${origin}${path}`, method: "GET", mode, destination: "" }, respondWith: (pending: Promise<Response>) => { result = pending; } });
      return result;
    },
  };
}

test("missing chunks returning the SPA HTML are never cached as JavaScript", async () => {
  const response = new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } });
  const runtime = worker({ response });
  assert.equal(await runtime.fetch("/assets/aiLearningSummary-old.js"), response);
  assert.equal(runtime.stored.length, 0);
});

test("poisoned cached chunks are bypassed and replaced by JavaScript", async () => {
  const cached = new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } });
  const response = new Response("export const ready = true;", { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
  const runtime = worker({ cached, response });
  assert.equal(await runtime.fetch("/assets/summary.js"), response);
  assert.equal(runtime.fetches, 1);
  assert.equal(runtime.stored.length, 1);
});

test("valid cached modules remain available offline, including mjs and query strings", async () => {
  const cached = new Response("export {};", { headers: { "Content-Type": "text/javascript" } });
  const runtime = worker({ cached, offline: true });
  assert.equal(await runtime.fetch("/assets/summary.mjs?v=1"), cached);
  assert.equal(runtime.fetches, 0);
});

test("unsuccessful chunk responses are not cached and API requests bypass the worker", async () => {
  const runtime = worker({ response: new Response("Not found", { status: 404 }) });
  assert.equal((await runtime.fetch("/assets/missing.js"))?.status, 404);
  assert.equal(runtime.stored.length, 0);
  assert.equal(runtime.fetch("/api/ai/summary"), undefined);
  assert.equal(runtime.fetches, 1);
});

test("offline module failures never fall back to poisoned cached HTML", async () => {
  const cached = new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } });
  await assert.rejects(worker({ cached, offline: true }).fetch("/assets/summary.js")!, /Offline/);
});

test("offline navigations still fall back to the cached HTML", async () => {
  const cached = new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } });
  assert.equal(await worker({ cached, offline: true }).fetch("/", "navigate"), cached);
});

test("Vercel keeps missing assets out of the SPA fallback and revalidates HTML", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const rewrite = new RegExp(`^${config.rewrites[0].source}$`);
  for (const path of ["/assets/aiLearningSummary-old.js", "/assets", "/api/ai/summary", "/api", "/sw.js", "/manifest.webmanifest", "/favicon.svg"]) {
    assert.equal(rewrite.test(path), false, path);
  }
  for (const path of ["/", "/index.html", "/lernen"]) assert.equal(rewrite.test(path), true, path);
  const header = config.headers.find((entry: { headers: Array<{ key: string; value: string }> }) => entry.headers.some(({ key, value }) => key === "Cache-Control" && value === "no-cache"));
  const headerRoute = new RegExp(`^${header.source}$`);
  assert.equal(headerRoute.test("/index.html"), true);
  assert.equal(headerRoute.test("/sw.js"), true);
  assert.equal(headerRoute.test("/assets/current.js"), false);
});

test("module load errors remain visible in German without suppressing failures or reloading drafts", () => {
  const events = new EventTarget();
  registerAppModuleLoadErrors(events);
  const error = new TypeError("error loading dynamically imported module: https://core.example/assets/old.js");
  const event = Object.assign(new Event("vite:preloadError", { cancelable: true }), { payload: error });
  assert.equal(events.dispatchEvent(event), true);
  assert.match(error.message, /sichere deine Änderungen und lade die Seite neu/);
  assert.equal(event.defaultPrevented, false);
});

test("service worker registration tolerates unsupported browsers and registration failures", async () => {
  assert.equal(await registerCoreServiceWorker(null), null);
  assert.equal(await registerCoreServiceWorker({ register: async () => { throw new Error("Unavailable"); } }), null);
});
