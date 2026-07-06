import assert from "node:assert/strict";
import test from "node:test";
import { resolveCardHtmlMedia } from "./mediaStore.js";

test("resolves only known media refs in sanitized card html", () => {
  const resolved = resolveCardHtmlMedia(
    '<script>alert(1)</script><img src="card_001.jpg" onerror="alert(2)"><img src="missing.jpg"><a href=card_001.jpg>open</a><a href="javascript:alert(3)">bad</a>',
    { "card_001.jpg": "blob:http://local/card_001" },
  );

  assert.equal(resolved.includes("<script"), false);
  assert.equal(resolved.includes("onerror"), false);
  assert.equal(resolved.includes("javascript:"), false);
  assert.equal(resolved.includes('src="blob:http://local/card_001"'), true);
  assert.equal(resolved.includes('href="blob:http://local/card_001"'), true);
  assert.equal(resolved.includes('src="missing.jpg"'), true);
});

