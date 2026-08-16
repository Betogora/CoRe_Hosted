import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsSaveBar } from "./SettingsSaveBar.tsx";

function renderBar({ saving = false, navigationBlocked = false } = {}) {
  return renderToStaticMarkup(
    <SettingsSaveBar open saving={saving} navigationBlocked={navigationBlocked} onSave={() => undefined} />,
  );
}

test("settings save bar is a responsive save-only nonmodal CoRe region", () => {
  const html = renderBar();
  assert.match(html, /data-testid="settings-save-bar"/);
  assert.match(html, /aria-label="Ungespeicherte Änderungen"/);
  assert.match(html, /core-overlay/);
  assert.match(html, /rounded-\[18px\]/);
  assert.match(html, /shadow-2xl/);
  assert.match(html, /ring-\[var\(--core-focus-ring-soft\)\]/);
  assert.match(html, /sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(html, /z-50/);
  assert.match(html, /left-\[50dvw\]/);
  assert.match(html, /max\(14dvh, calc\(env\(safe-area-inset-bottom\) \+ 5rem\)\)/);
  assert.equal((html.match(/>Speichern</g) ?? []).length, 1);
  assert.doesNotMatch(html, /Verwerfen/);
  assert.equal((html.match(/min-h-11/g) ?? []).length, 1);
  assert.doesNotMatch(html, /role="dialog"|aria-modal|action-dialog-backdrop|core-backdrop/);
});

test("settings save bar disables its action while saving", () => {
  const html = renderBar({ saving: true });
  assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
  assert.match(html, /aria-busy="true"/);
});

test("settings save bar politely announces a blocked navigation", () => {
  const html = renderBar({ navigationBlocked: true });
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /Zum Verlassen zuerst speichern\./);
});
