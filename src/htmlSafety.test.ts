import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeCardHtml, stripHtml, stripSanitizedHtml } from "./htmlSafety.ts";

test("card HTML sanitizer preserves rich card markup and local media", () => {
  const sanitized = sanitizeCardHtml(
    '<table class="facts"><tr><th scope="row">ATP</th><td><ruby>細胞<rt>さいぼう</rt></ruby></td></tr></table>'
      + '<img src="anki-image.png" alt="Zelle" style="text-align:center;color:#663399">'
      + '<audio controls src="blob:https://core.local/audio"></audio>',
  );

  assert.match(sanitized, /<table class="facts">/);
  assert.match(sanitized, /<ruby>細胞<rt>さいぼう<\/rt><\/ruby>/);
  assert.match(sanitized, /src="anki-image.png"/);
  assert.match(sanitized, /color:#663399/);
  assert.match(sanitized, /<audio controls src="blob:https:\/\/core.local\/audio"><\/audio>/);
});

test("card HTML sanitizer removes active content and external media requests", () => {
  const sanitized = sanitizeCardHtml(
    '<script>alert(1)</script>'
      + '<img src="https://tracker.example/pixel" onerror="alert(2)">'
      + '<a href="javascript:alert(3)" onclick="alert(4)">Link</a>'
      + '<iframe src="https://tracker.example/frame"></iframe>'
      + '<span style="background-image:url(https://tracker.example/x)">Text</span>',
  );

  assert.doesNotMatch(sanitized, /script|iframe|onerror|onclick|javascript:|tracker\.example/i);
  assert.equal(stripHtml(sanitized).replace(/\s+/g, " ").trim(), "Link Text");
});

test("card HTML sanitizer preserves accessibility metadata without executable attributes", () => {
  const sanitized = sanitizeCardHtml('<mark data-cloze-group="2" aria-label="Lücke 2" onfocus="x()">Begriff</mark>');
  assert.equal(sanitized, '<mark data-cloze-group="2" aria-label="Lücke 2">Begriff</mark>');
});

test("trusted sanitized card HTML can be projected to text without changing its markup", () => {
  const sanitized = sanitizeCardHtml('<b>ATP</b><script>alert(1)</script>');
  assert.equal(stripSanitizedHtml(sanitized).replace(/\s+/g, " ").trim(), "ATP");
  assert.equal(sanitized, "<b>ATP</b>");
});
