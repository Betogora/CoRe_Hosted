const CACHE_NAME = "core-app-shell-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg"];
// Asset lists of the latest and the previous build: a tab opened before the last deploy keeps its chunks offline.
const ASSET_BUILDS = "/__core-asset-builds";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("core-app-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.registration.navigationPreload?.enable(),
  ]).then(() => self.clients.claim()));
});

async function pruneAssets(cache) {
  const listed = await fetch("/sw-assets.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : null);
  if (!Array.isArray(listed)) return;
  const stored = await cache.match(ASSET_BUILDS);
  const [latest = []] = stored ? await stored.json() : [];
  if (stored && latest.join("\n") === listed.join("\n")) return;
  const keep = new Set([...listed, ...latest]);
  const requests = await cache.keys();
  await Promise.all(requests.filter((request) => {
    const { pathname } = new URL(request.url);
    return pathname.startsWith("/assets/") && !keep.has(pathname);
  }).map((request) => cache.delete(request)));
  await cache.put(ASSET_BUILDS, new Response(JSON.stringify([listed, latest])));
}

async function refreshShell(response) {
  const cache = await caches.open(CACHE_NAME);
  const previous = await cache.match("/index.html");
  const html = await response.clone().text();
  await cache.put("/index.html", response);
  if (!previous || await previous.text() !== html || !(await cache.match(ASSET_BUILDS))) await pruneAssets(cache);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const isScript = request.destination === "script" || /\.(?:m?js)$/.test(url.pathname);
  const canCache = (response) => response.ok && (!isScript || /^(?:text|application)\/(?:javascript|ecmascript)(?:\s*;|$)/i.test(response.headers.get("Content-Type") || ""));

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = (await event.preloadResponse) || await fetch(request);
        if (response.ok) event.waitUntil(refreshShell(response.clone()).catch(() => undefined));
        return response;
      } catch {
        return (await caches.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached && canCache(cached) ? cached : fetch(request).then((response) => {
    if (canCache(response)) {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
