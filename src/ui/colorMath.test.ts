import assert from "node:assert/strict";
import test from "node:test";
import { colorContrast, ensureTextContrast, resolveCssColor } from "./colorMath.ts";

test("Kontrast entspricht den WCAG-Referenzwerten", () => {
  assert.equal(colorContrast("#000000", "#ffffff"), 21);
  assert.equal(colorContrast("#ffffff", "#ffffff"), 1);
});

test("CSS-Farben werden als Hex, Name, RGB und HSL einschließlich Transparenz gelesen", () => {
  assert.equal(resolveCssColor("#abc"), "#aabbcc");
  assert.equal(resolveCssColor("rebeccapurple"), "#663399");
  assert.equal(resolveCssColor("rgb(100% 0% 0%)"), "#ff0000");
  assert.equal(resolveCssColor("hsl(120deg 100% 50%)"), "#00ff00");
  assert.equal(resolveCssColor("rgba(0, 0, 0, 0.5)", "#ffffff"), "#808080");
  assert.equal(resolveCssColor("currentColor"), null);
});

test("Feldfarben behalten ausreichenden Kontrast oder werden nur in ihrer Helligkeit angepasst", () => {
  assert.equal(ensureTextContrast("#000000", "#ffffff"), "#000000");
  for (const background of ["#ffffff", "#262e3a"]) for (const color of ["#ffff00", "#0000ff", "#ff0000", "#aaaaaa"]) {
    assert.ok(colorContrast(ensureTextContrast(color, background), background) >= 4.5);
  }
});
