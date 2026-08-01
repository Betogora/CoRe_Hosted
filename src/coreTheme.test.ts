import assert from "node:assert/strict";
import test from "node:test";
import { resolveCoreTheme, toggleCoreTheme } from "./coreTheme.ts";

test("core theme defaults invalid and missing preferences to light", () => {
  assert.equal(resolveCoreTheme(undefined), "light");
  assert.equal(resolveCoreTheme("system"), "light");
  assert.equal(resolveCoreTheme("light"), "light");
  assert.equal(resolveCoreTheme("dark"), "dark");
});

test("core theme toggles explicitly between light and dark", () => {
  assert.equal(toggleCoreTheme("light"), "dark");
  assert.equal(toggleCoreTheme("dark"), "light");
});
