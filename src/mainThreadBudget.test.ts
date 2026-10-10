import assert from "node:assert/strict";
import test from "node:test";
import { createMainThreadBudget } from "./mainThreadBudget.ts";

test("das Zeitbudget gibt den Haupt-Thread erst nach Ablauf der Scheibe frei", async () => {
  let yielded = 0;
  const original = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: () => void) => { yielded += 1; callback(); return 0; }) as unknown as typeof setTimeout;
  try {
    const pause = createMainThreadBudget(5);
    await pause();
    assert.equal(yielded, 0, "innerhalb der Scheibe läuft die Schleife ohne Pause weiter");
    const busyUntil = performance.now() + 6;
    while (performance.now() < busyUntil) { /* belegt die Scheibe */ }
    await pause();
    assert.equal(yielded, 1);
    await pause();
    assert.equal(yielded, 1, "nach der Pause beginnt eine neue Scheibe");
  } finally {
    globalThis.setTimeout = original;
  }
});
