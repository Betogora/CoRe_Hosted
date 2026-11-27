import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { registerAppModuleLoadErrors, registerCoreServiceWorker } from "./pwa.ts";

const origin = "https://core.example";
const workerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function pathOf(key: unknown) {
  return typeof key === "string" ? key : new URL((key as { url: string }).url).pathname;
}

function worker({ cached, response, offline = false, entries = new Map<string, Response>(), files = {} }: {
  cached?: Response;
  response?: Response;
  offline?: boolean;
  entries?: Map<string, Response>;
  files?: Record<string, () => Response>;
} = {}) {
  const listeners = new Map<string, (event: unknown) => void>();
  const stored: Array<{ key: unknown; response: Response }> = [];
  const pending: Promise<unknown>[] = [];
  const matchOptions: unknown[] = [];
  const cache = {
    put: async (key: unknown, response: Response) => { stored.push({ key, response }); entries.set(pathOf(key), response); },
    match: async (key: unknown) => entries.get(pathOf(key))?.clone(),
    keys: async () => [...entries.keys()].map((path) => ({ url: `${origin}${path}` })),
    delete: async (key: unknown) => entries.delete(pathOf(key)),
  };
  let fetches = 0;
  runInNewContext(workerSource, {
    self: { location: { origin }, addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener) },
    caches: {
      match: async (_key: unknown, options?: unknown) => { matchOptions.push(options); return cached; },
      open: async () => cache,
    },
    fetch: async (input: unknown) => {
      fetches++;
      if (offline) throw new TypeError("Offline");
      return typeof input === "string" && files[input] ? files[input]() : response;
    },
    URL, Response,
  });
  return {
    stored,
    matchOptions,
    get fetches() { return fetches; },
    settled: () => Promise.all(pending),
    fetch: (path: string, mode = "cors", preloadResponse?: Promise<Response>) => {
      let result: Promise<Response> | undefined;
      listeners.get("fetch")!({
        request: { url: `${origin}${path}`, method: "GET", mode, destination: "" },
        preloadResponse,
        respondWith: (response: Promise<Response>) => { result = response; },
        waitUntil: (promise: Promise<unknown>) => { pending.push(promise); },
      });
      return result;
    },
  };
}

const html = (build: string) => new Response(`<!doctype html><script src="/assets/index-${build}.js"></script>`, { headers: { "Content-Type": "text/html" } });
const script = () => new Response("export {};", { headers: { "Content-Type": "text/javascript" } });

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
  assert.equal((runtime.matchOptions[0] as { ignoreVary?: boolean } | undefined)?.ignoreVary, true, "a chunk cached by a prefetch also answers the module request");
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

test("navigations use the preloaded response instead of a second request", async () => {
  const runtime = worker({ entries: new Map([["/index.html", html("a")], ["/__core-asset-builds", Response.json([[], []])]]) });
  const preloaded = html("a");
  assert.equal(await runtime.fetch("/lernen", "navigate", Promise.resolve(preloaded)), preloaded);
  await runtime.settled();
  assert.equal(runtime.fetches, 0);
});

test("a new build keeps cached assets of the current and the previous build only", async () => {
  const entries = new Map([
    ["/index.html", html("b")],
    ["/__core-asset-builds", Response.json([["/assets/index-b.js", "/assets/shared.js"], ["/assets/index-a.js"]])],
    ["/assets/index-a.js", script()],
    ["/assets/index-b.js", script()],
    ["/assets/shared.js", script()],
    ["/fonts/manrope/manrope-variable.woff2", new Response("font")],
  ]);
  const runtime = worker({ entries, response: html("c"), files: { "/sw-assets.json": () => Response.json(["/assets/index-c.js", "/assets/shared.js"]) } });
  await runtime.fetch("/", "navigate");
  await runtime.settled();
  assert.deepEqual([...entries.keys()].filter((path) => path.startsWith("/assets/")).sort(), ["/assets/index-b.js", "/assets/shared.js"]);
  assert.equal(entries.has("/fonts/manrope/manrope-variable.woff2"), true);
  assert.deepEqual(await entries.get("/__core-asset-builds")!.json(), [["/assets/index-c.js", "/assets/shared.js"], ["/assets/index-b.js", "/assets/shared.js"]]);
});

test("an unchanged build neither loads the asset list nor drops assets", async () => {
  const entries = new Map([
    ["/index.html", html("b")],
    ["/__core-asset-builds", Response.json([["/assets/index-b.js"], []])],
    ["/assets/unlisted.js", script()],
  ]);
  const runtime = worker({ entries, response: html("b") });
  await runtime.fetch("/", "navigate");
  await runtime.settled();
  assert.equal(runtime.fetches, 1);
  assert.equal(entries.has("/assets/unlisted.js"), true);
});

test("a missing asset list keeps every cached asset", async () => {
  const entries = new Map([["/assets/index-a.js", script()]]);
  const runtime = worker({ entries, response: html("b"), files: { "/sw-assets.json": () => html("b") } });
  await runtime.fetch("/", "navigate");
  await runtime.settled();
  assert.equal(entries.has("/assets/index-a.js"), true);
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
  const cacheControl = (path: string) => config.headers.filter((entry: { source: string }) => new RegExp(`^${entry.source}$`).test(path))
    .flatMap((entry: { headers: Array<{ key: string; value: string }> }) => entry.headers.filter(({ key }) => key === "Cache-Control").map(({ value }) => value));
  assert.deepEqual(cacheControl("/assets/index-a1b2.js"), ["public, max-age=31536000, immutable"]);
  assert.deepEqual(cacheControl("/fonts/manrope/manrope-variable.woff2"), ["public, max-age=604800"]);
  assert.deepEqual(cacheControl("/sw-assets.json"), ["no-cache"]);
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
