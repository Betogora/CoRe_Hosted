import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Save, Trash2 } from "lucide-react";
import { ActionButton, IconButton } from "./actionUi.tsx";

test("ActionButton centralizes variants and the labeled loading contract", () => {
  const variants = ["primary", "secondary", "destructive"] as const;
  for (const variant of variants) {
    const markup = renderToStaticMarkup(<ActionButton variant={variant}>Aktion</ActionButton>);
    assert.match(markup, new RegExp(`core-action-${variant}`));
  }

  const loading = renderToStaticMarkup(<ActionButton variant="primary" icon={Save} loading>Speichern</ActionButton>);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /disabled=""/);
  assert.match(loading, />Speichern</);
  assert.match(loading, /animate-spin/);
});

test("IconButton exposes its required accessible name, semantic variant and square target", () => {
  const markup = renderToStaticMarkup(<IconButton label="Löschen" icon={Trash2} variant="destructive" />);
  assert.match(markup, /aria-label="Löschen"/);
  assert.match(markup, /core-action-destructive/);
  assert.match(markup, /min-w-11/);
});

test("IconButton uses the outlined secondary action by default", () => {
  const markup = renderToStaticMarkup(<IconButton label="Speichern" icon={Save} />);
  assert.match(markup, /core-action-secondary/);
});
