import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsSaveBar } from "./SettingsSaveBar.tsx";

function renderBar({ savingScope = null, navigationBlocked = false, mode = "global" }: { savingScope?: "global" | "deck" | "deck-tree" | "all-decks" | "new-decks" | null; navigationBlocked?: boolean; mode?: "global" | "learning-global" | "deck" | "deck-tree" } = {}) {
  return renderToStaticMarkup(
    <SettingsSaveBar open savingScope={savingScope} navigationBlocked={navigationBlocked} mode={mode} onSave={() => undefined} onDiscard={() => undefined} />,
  );
}

test("settings save bar is a responsive dismissible nonmodal CoRe region", () => {
  const html = renderBar();
  assert.match(html, /data-testid="settings-save-bar"/);
  assert.match(html, /aria-label="Änderungen speichern\?"/);
  assert.match(html, /Änderungen speichern\?/);
  assert.match(html, /core-overlay/);
  assert.match(html, /core-settings-save-bar/);
  assert.match(html, /core-settings-save-badge/);
  assert.match(html, /rounded-2xl/);
  assert.match(html, /w-\[min\(42rem,calc\(100dvw-2rem\)\)\]/);
  assert.match(html, /sm:grid-cols-\[minmax\(0,1fr\)_auto_auto\]/);
  assert.match(html, /z-50/);
  assert.match(html, /left-\[50dvw\]/);
  assert.match(html, /max\(14dvh, calc\(env\(safe-area-inset-bottom\) \+ 5rem\)\)/);
  assert.equal((html.match(/>Speichern</g) ?? []).length, 1);
  assert.match(html, /aria-label="Änderungen verwerfen"/);
  assert.equal((html.match(/min-h-11/g) ?? []).length, 1);
  assert.doesNotMatch(html, /role="dialog"|aria-modal|action-dialog-backdrop|core-backdrop/);
});

test("deck-tree save bar offers separate actions for the stack and all descendants", () => {
  const html = renderBar({ mode: "deck-tree" });

  assert.match(html, />Nur diesen Stapel speichern</);
  assert.match(html, />Stapel und Unterstapel speichern</);
  assert.equal((html.match(/min-h-11/g) ?? []).length, 2);
  assert.match(html, /class="core-action-primary[^"]*"[^>]*><svg[^>]*>[\s\S]*?<span>Stapel und Unterstapel speichern<\/span>/);
  assert.match(html, /class="core-action-secondary[^"]*"[^>]*><svg[^>]*>[\s\S]*?<span>Nur diesen Stapel speichern<\/span>/);
  assert.ok(html.indexOf("Stapel und Unterstapel speichern") < html.indexOf("Nur diesen Stapel speichern"));
  assert.doesNotMatch(html, /role="dialog"|aria-modal/);
});

test("global learning save bar distinguishes all stacks from future stacks", () => {
  const html = renderBar({ mode: "learning-global" });

  assert.match(html, />Auf alle Stapel anwenden</);
  assert.match(html, />Auf alle neuen Stapel anwenden</);
  assert.ok(html.indexOf("Auf alle Stapel anwenden") < html.indexOf("Auf alle neuen Stapel anwenden"));
  assert.equal((html.match(/min-h-11/g) ?? []).length, 2);
});

test("settings save bar disables its action while saving", () => {
  const html = renderBar({ savingScope: "global" });
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /aria-busy="true"/);
});

test("deck-tree save bar marks only the selected save scope as busy", () => {
  const html = renderBar({ mode: "deck-tree", savingScope: "deck-tree" });
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
  assert.equal((html.match(/aria-busy="true"/g) ?? []).length, 1);
});

test("settings save bar politely announces a blocked navigation", () => {
  const html = renderBar({ navigationBlocked: true });
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /Zum Verlassen zuerst speichern\./);
});

test("settings save bar uses a subtle accent without a colored glow", () => {
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const saveBarRule = styles.match(/\.core-settings-save-bar\s*\{([\s\S]*?)\n\s*}/)?.[1] ?? "";

  assert.match(saveBarRule, /border: 1px solid var\(--core-settings-save-border\)/);
  assert.match(saveBarRule, /background: var\(--core-settings-save-surface\)/);
  assert.doesNotMatch(saveBarRule, /box-shadow|linear-gradient/);
});
