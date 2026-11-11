import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { RealtimeClient } from "./supabaseRealtimeStub.ts";

test("der Realtime-Ersatz kann jede Methode, die das installierte supabase-js am Realtime-Client aufruft", () => {
  const packageJson = createRequire(import.meta.url).resolve("@supabase/supabase-js/package.json");
  const source = readFileSync(path.join(path.dirname(packageJson), "dist", "index.mjs"), "utf8");
  const called = [...new Set([...source.matchAll(/this\.realtime\.(\w+)\(/g)].map((match) => match[1]))];
  assert.ok(called.includes("setAuth"));
  const stub = new RealtimeClient() as unknown as Record<string, unknown>;
  assert.deepEqual(called.filter((method) => typeof stub[method] !== "function"), []);
  assert.deepEqual([...source.matchAll(/import \{([^}]+)\} from "@supabase\/realtime-js"/g)].flatMap((match) => match[1].split(",").map((name) => name.trim())), ["RealtimeClient"]);
});
