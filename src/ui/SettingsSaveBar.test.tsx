import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsSaveBar } from "./SettingsSaveBar.tsx";

function renderBar(saving = false) {
  return renderToStaticMarkup(
    <SettingsSaveBar open saving={saving} onDiscard={() => undefined} onSave={() => undefined} />,
  );
}

test("settings save bar is a two-row nonmodal CoRe region", () => {
  const html = renderBar();
  assert.match(html, /data-testid="settings-save-bar"/);
  assert.match(html, /aria-label="Ungespeicherte Änderungen"/);
  assert.match(html, /core-overlay/);
  assert.match(html, /rounded-\[18px\]/);
  assert.match(html, /z-50/);
  assert.match(html, /left-\[50dvw\]/);
  assert.match(html, /max\(14dvh, calc\(env\(safe-area-inset-bottom\) \+ 5rem\)\)/);
  assert.ok(html.indexOf("Verwerfen") < html.indexOf("Speichern"));
  assert.equal((html.match(/min-h-11/g) ?? []).length, 2);
  assert.doesNotMatch(html, /role="dialog"|aria-modal|action-dialog-backdrop|core-backdrop/);
});

test("settings save bar disables both actions while saving", () => {
  const html = renderBar(true);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /aria-busy="true"/);
});
