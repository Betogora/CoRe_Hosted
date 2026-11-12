import assert from "node:assert/strict";
import test from "node:test";
import { createFieldTimings, FIELD_TIMING_LIMIT } from "./fieldTimings.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  const writes: string[] = [];
  return {
    values,
    writes,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(key); values.set(key, value); },
  };
}

/** A clock the test advances, so each answer takes exactly the given milliseconds. */
function timings(storage = memoryStorage(), idle: Array<() => void> = []) {
  let clock = 0;
  const instance = createFieldTimings({ storage, version: "1.2.3", now: () => clock, today: () => 20_404, whenIdle: (run) => idle.push(run) });
  const answer = (durationMs: number) => {
    instance.start("core:answer_shown");
    clock += durationMs;
    instance.finish("card-frame");
  };
  return { instance, storage, idle, answer };
}

test("keeps the newest 200 values per metric in the order they were measured", () => {
  const { instance, storage, idle, answer } = timings();
  instance.bind("user-a");
  for (let index = 1; index <= FIELD_TIMING_LIMIT + 5; index += 1) {
    answer(index);
    idle.splice(0).forEach((save) => save());
  }

  const values = instance.read()["core:answer_shown"]!.map(([durationMs]) => durationMs);
  assert.equal(values.length, FIELD_TIMING_LIMIT);
  assert.deepEqual(values.slice(0, 2), [6, 7]);
  assert.equal(values.at(-1), FIELD_TIMING_LIMIT + 5);

  instance.hide();
  const reopened = timings(storage).instance;
  reopened.bind("user-a");
  assert.deepEqual(reopened.read()["core:answer_shown"]!.map(([durationMs]) => durationMs), values);
});

test("saves in batches while idle and keeps the values for the next page load", () => {
  const storage = memoryStorage();
  const { instance, idle, answer } = timings(storage);
  instance.bind("user-a");
  for (let index = 0; index < 19; index += 1) answer(10);
  assert.equal(idle.length, 0);
  assert.equal(storage.writes.length, 0);
  answer(10);
  assert.equal(idle.length, 1);
  assert.equal(storage.writes.length, 0, "recording itself never writes");
  idle.shift()!();
  assert.equal(storage.writes.length, 1);

  const next = timings(storage).instance;
  next.bind("user-a");
  assert.equal(next.read()["core:answer_shown"]!.length, 20);
});

test("an interaction ends only at its own end point and the hidden page drops it", () => {
  const { instance, answer } = timings();
  instance.bind("user-a");
  instance.start("core:card_search_results");
  instance.finish("card-frame");
  assert.deepEqual(instance.read(), {});

  instance.start("core:rating_to_next_card");
  instance.hide();
  instance.finish("card-frame");
  instance.start("core:answer_shown");
  instance.cancel("card-frame");
  instance.finish("card-frame");
  assert.deepEqual(instance.read(), {});

  answer(42);
  assert.deepEqual(instance.read(), { "core:answer_shown": [[42, 20_404]] });
});

test("start phases come from the existing measures, once per page load, and only for an account", () => {
  let deliver: ((name: string, durationMs: number) => void) | null = null;
  const instance = createFieldTimings({ storage: memoryStorage(), version: "1", today: () => 3, observeStartup: (record) => { deliver = record; } });
  instance.start("core:answer_shown");
  instance.finish("card-frame");
  assert.equal(deliver, null);

  instance.bind("user-a");
  deliver!("core:session_check", 120.4);
  deliver!("core:session_check", 900);
  deliver!("core:feature:study:load", 50);
  deliver!("core:bootstrap_rpc", -1);
  assert.deepEqual(instance.read(), { "core:session_check": [[120, 3]] });
});

test("broken or foreign stored values are dropped instead of thrown", () => {
  const storage = memoryStorage();
  const key = "core.accountState.v2.user-a.core.fieldTimings.v1";
  const read = (raw: string) => {
    storage.values.set(key, raw);
    const instance = createFieldTimings({ storage, version: "1.2.3" });
    instance.bind("user-a");
    return instance.read();
  };

  assert.deepEqual(read("{kaputt"), {});
  assert.deepEqual(read("[1,2]"), {});
  assert.deepEqual(read(JSON.stringify({ version: "1.2.2", metrics: { "core:answer_shown": [[5, 1]] } })), {});
  assert.deepEqual(read(JSON.stringify({
    version: "1.2.3",
    metrics: {
      "core:answer_shown": [[5, 1], [-1, 1], ["7", 1], [1.5, 1], [700_000, 1], [8], [9, 2, 3], null, [12, 2]],
      "core:session_check": "nicht-liste",
      "core:secret": [[1, 1]],
    },
  })), { "core:answer_shown": [[5, 1], [12, 2]] });
});

test("an account sees only its own values; the previous account's are saved before switching", () => {
  const { instance, storage, answer } = timings();
  instance.bind("user-a");
  answer(30);
  instance.bind("user-b");
  assert.deepEqual(instance.read(), {});
  assert.deepEqual([...storage.values.keys()], ["core.accountState.v2.user-a.core.fieldTimings.v1"]);
  answer(40);
  instance.bind(null);
  assert.deepEqual(instance.read(), {});
  answer(50);

  instance.bind("user-a");
  assert.deepEqual(instance.read(), { "core:answer_shown": [[30, 20_404]] });
  instance.bind("user-b");
  assert.deepEqual(instance.read(), { "core:answer_shown": [[40, 20_404]] });
});
