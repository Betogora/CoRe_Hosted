import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes } from "./screenConstants.ts";

test("formatBytes uses decimal German file sizes", () => {
  assert.equal(formatBytes(6_900_000), "6,9 MB");
  assert.equal(formatBytes(250_000_000), "250 MB");
  assert.equal(formatBytes(999_000), "999 KB");
});
