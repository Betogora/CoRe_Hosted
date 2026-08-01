import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Save, Trash2 } from "lucide-react";
import { ActionButton, IconButton } from "./actionUi.tsx";

test("ActionButton centralizes variants, sizes and the labeled loading contract", () => {
  const variants = ["primary", "secondary", "tertiary", "destructive"] as const;
  for (const variant of variants) {
    const markup = renderToStaticMarkup(<ActionButton variant={variant}>Aktion</ActionButton>);
    assert.match(markup, new RegExp(`core-action-${variant}`));
  }

  const loading = renderToStaticMarkup(<ActionButton variant="primary" size="large" icon={Save} loading>Speichern</ActionButton>);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /disabled=""/);
  assert.match(loading, />Speichern</);
  assert.match(loading, /animate-spin/);
  assert.match(loading, /min-h-12/);
});

test("IconButton exposes its required accessible name and touch target", () => {
  const markup = renderToStaticMarkup(<IconButton label="Löschen" icon={Trash2} variant="destructive" size="compact" />);
  assert.match(markup, /aria-label="Löschen"/);
  assert.match(markup, /core-action-destructive/);
  assert.match(markup, /min-h-9/);
  assert.match(markup, /min-w-9/);
});
