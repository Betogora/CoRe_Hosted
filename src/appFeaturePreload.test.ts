import assert from "node:assert/strict";
import test from "node:test";
import { allowsAutomaticPreloading, allowsIntentPreloading, createChunkPrefetcher, parseFeatureChunks, startAdaptiveFeaturePreloading } from "./appFeaturePreload.ts";

test("unterbindet Preloading bei Datensparmodus, langsamem Netz und unsichtbarem Tab", () => {
  assert.equal(allowsAutomaticPreloading({ network: { saveData: true } }), false);
  assert.equal(allowsIntentPreloading({ network: { effectiveType: "2g" } }), false);
  assert.equal(allowsAutomaticPreloading({ documentTarget: { visibilityState: "hidden" } }), false);
  assert.equal(allowsIntentPreloading({ network: { effectiveType: "4g" }, documentTarget: { visibilityState: "visible" } }), true);
});

test("lädt automatisch nur bei 4g oder ohne Network-Information vor", () => {
  assert.equal(allowsAutomaticPreloading({ network: null }), true);
  assert.equal(allowsAutomaticPreloading({ network: { effectiveType: "4g" } }), true);
  assert.equal(allowsAutomaticPreloading({ network: { effectiveType: "3g" } }), false);
  assert.equal(allowsIntentPreloading({ network: { effectiveType: "3g" } }), true);
});

test("lädt nach der Ruhephase Lernen und danach Karten seriell vor", async () => {
  const loaded: string[] = [];
  const cleanup = startAdaptiveFeaturePreloading({
    preload: async (viewId) => { loaded.push(viewId); },
    documentTarget: { visibilityState: "visible" },
    network: { effectiveType: "4g" },
    setTimer(callback) { callback(); return 1; },
    clearTimer() {},
    requestIdle(callback) { callback(); return 1; },
    cancelIdle() {},
    interactionTarget: null,
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(loaded, ["lernen", "kartenstapel"]);
  cleanup();
});

test("eine Nutzerinteraktion beendet noch nicht gestartete Hintergrundarbeit", () => {
  let interaction: (() => void) | null = null;
  let delayed: (() => void) | null = null;
  const loaded: string[] = [];
  startAdaptiveFeaturePreloading({
    preload: async (viewId) => { loaded.push(viewId); },
    setTimer(callback) { delayed = callback; return 1; },
    clearTimer() {},
    interactionTarget: {
      addEventListener(_event: string, listener: () => void) { interaction = listener; },
      removeEventListener() {},
    },
  });
  (interaction as (() => void) | null)?.();
  (delayed as (() => void) | null)?.();
  assert.deepEqual(loaded, []);
});

test("die Chunkliste aus index.html übernimmt nur Einträge mit Dateilisten", () => {
  assert.deepEqual(parseFeatureChunks('{"DecksScreen":{"files":["a.js"],"parts":[]},"Kaputt":{"files":"a.js"}}'), {
    DecksScreen: { files: ["a.js"], parts: [] },
  });
  assert.deepEqual(parseFeatureChunks("kein JSON"), {});
  assert.deepEqual(parseFeatureChunks(null), {});
});

test("der Prefetcher lädt jede Datei einmal und versucht eine gescheiterte erneut", async () => {
  const fetched: string[] = [];
  let failNext = true;
  const prefetch = createChunkPrefetcher(async (url) => {
    fetched.push(url);
    if (url === "b.js" && failNext) {
      failNext = false;
      throw new Error("offline");
    }
  });
  await Promise.all([prefetch(["a.js", "b.js"]), prefetch(["a.js"])]);
  await prefetch(["a.js", "b.js"]);
  assert.deepEqual(fetched, ["a.js", "b.js", "b.js"]);
});
