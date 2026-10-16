import assert from "node:assert/strict";
import test from "node:test";
import { createLatestSaver } from "./latestSaver.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("Änderungen während einer Speicherung werden danach gespeichert, nie parallel; Importe werden abgewartet, Fehler gemeldet", async () => {
  const state = { latest: "a" as string | null, stored: null as string | null, pending: null as Promise<boolean> | null, writes: [] as string[], active: 0, maxActive: 0 };
  let release = () => {}, finishImport = (_ok: boolean) => {};
  const saver = createLatestSaver({ latest: () => state.latest, stored: () => state.stored, pending: () => state.pending, save: async (value) => {
    state.maxActive = Math.max(state.maxActive, ++state.active); state.writes.push(value);
    await new Promise<void>((resolve) => { release = resolve; }); state.active -= 1; state.stored = value;
  } });
  const first = saver();
  assert.equal(saver(), first);
  await tick(); state.latest = "b"; state.latest = "c"; release(); await tick(); release();
  assert.equal(await first, "saved");
  assert.deepEqual([state.writes, state.maxActive, await saver()], [["a", "c"], 1, "current"]);
  state.pending = new Promise((resolve) => { finishImport = resolve; });
  const withImage = saver(); await tick();
  assert.deepEqual(state.writes, ["a", "c"]);
  state.latest = "mit Bild"; state.pending = null; finishImport(true); await tick(); release();
  assert.deepEqual([await withImage, state.writes.at(-1)], ["saved", "mit Bild"]);
  state.latest = "danach"; state.pending = Promise.resolve(false);
  assert.equal(await saver(), "stopped");
  const failing = createLatestSaver({ latest: () => "x", stored: () => null, pending: () => null, save: () => Promise.reject(new Error("voll")) });
  await assert.rejects(failing(), /voll/);
  await assert.rejects(failing(), /voll/);
});
