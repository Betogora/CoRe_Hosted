import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsSaveBar } from "./SettingsSaveBar.tsx";

function renderBar({ savingScope = null, navigationBlocked = false, mode = "global" }: { savingScope?: "global" | "deck" | "deck-tree" | null; navigationBlocked?: boolean; mode?: "global" | "deck" | "deck-tree" } = {}) {
  return renderToStaticMarkup(
    <SettingsSaveBar open savingScope={savingScope} navigationBlocked={navigationBlocked} mode={mode} onSave={() => undefined} />,
  );
}

test("settings save bar is a responsive save-only nonmodal CoRe region", () => {
  const html = renderBar();
  assert.match(html, /data-testid="settings-save-bar"/);
  assert.match(html, /aria-label="Ungespeicherte Änderungen"/);
  assert.match(html, /core-overlay/);
  assert.match(html, /core-settings-save-bar/);
  assert.match(html, /core-settings-save-badge/);
  assert.match(html, /rounded-\[20px\]/);
  assert.match(html, /sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(html, /z-50/);
  assert.match(html, /left-\[50dvw\]/);
  assert.match(html, /max\(14dvh, calc\(env\(safe-area-inset-bottom\) \+ 5rem\)\)/);
  assert.equal((html.match(/>Speichern</g) ?? []).length, 1);
  assert.doesNotMatch(html, /Verwerfen/);
  assert.equal((html.match(/min-h-11/g) ?? []).length, 1);
  assert.doesNotMatch(html, /role="dialog"|aria-modal|action-dialog-backdrop|core-backdrop/);
});

test("deck-tree save bar offers separate actions for the stack and all descendants", () => {
  const html = renderBar({ mode: "deck-tree" });

  assert.match(html, />Einstellungen für Stapel speichern</);
  assert.match(html, />Einstellungen für Stapel und alle Unterstapel speichern</);
  assert.equal((html.match(/min-h-11/g) ?? []).length, 2);
  assert.doesNotMatch(html, /role="dialog"|aria-modal/);
});

test("settings save bar disables its action while saving", () => {
  const html = renderBar({ savingScope: "global" });
  assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
  assert.match(html, /aria-busy="true"/);
});

test("deck-tree save bar marks only the selected save scope as busy", () => {
  const html = renderBar({ mode: "deck-tree", savingScope: "deck-tree" });
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.equal((html.match(/aria-busy="true"/g) ?? []).length, 1);
});

test("settings save bar politely announces a blocked navigation", () => {
  const html = renderBar({ navigationBlocked: true });
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /Zum Verlassen zuerst speichern\./);
});
