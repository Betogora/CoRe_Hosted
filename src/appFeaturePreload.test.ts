import assert from "node:assert/strict";
import test from "node:test";
import { allowsSpeculativePreloading, startAdaptiveFeaturePreloading } from "./appFeaturePreload.ts";

test("unterbindet Preloading bei Datensparmodus, langsamem Netz und unsichtbarem Tab", () => {
  assert.equal(allowsSpeculativePreloading({ network: { saveData: true } }), false);
  assert.equal(allowsSpeculativePreloading({ network: { effectiveType: "2g" } }), false);
  assert.equal(allowsSpeculativePreloading({ documentTarget: { visibilityState: "hidden" } }), false);
  assert.equal(allowsSpeculativePreloading({ network: { effectiveType: "4g" }, documentTarget: { visibilityState: "visible" } }), true);
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
