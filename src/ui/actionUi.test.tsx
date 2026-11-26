import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChevronLeft, ChevronRight, Play, Save, Trash2 } from "lucide-react";
import { ActionButton, CloseButton, CrossLinkButton, IconButton } from "./actionUi.tsx";

test("ActionButton centralizes variants and the labeled loading contract", () => {
  const variants = ["primary", "secondary", "destructive"] as const;
  for (const variant of variants) {
    const markup = renderToStaticMarkup(<ActionButton variant={variant}>Aktion</ActionButton>);
    assert.match(markup, new RegExp(`core-action-${variant}`));
  }

  assert.match(renderToStaticMarkup(<ActionButton variant="destructive-secondary">Abmelden</ActionButton>), /class="core-action-secondary core-action-destructive-secondary /);

  const loading = renderToStaticMarkup(<ActionButton variant="primary" icon={Save} loading>Speichern</ActionButton>);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /disabled=""/);
  assert.match(loading, />Speichern</);
  assert.match(loading, /animate-spin/);
});

test("action buttons fill the play sign and put the forward chevron after the label", () => {
  const start = renderToStaticMarkup(<><ActionButton variant="primary" icon={Play}>Lernen</ActionButton><IconButton label="Biologie lernen" icon={Play} variant="ghost" /></>);
  assert.equal(start.match(/<svg[^>]*fill="currentColor"[^>]*lucide-play/g)?.length, 2);
  assert.match(renderToStaticMarkup(<ActionButton variant="primary" icon={Save}>Speichern</ActionButton>), /<svg[^>]*fill="none"[^>]*lucide-save/);

  assert.match(renderToStaticMarkup(<ActionButton variant="primary" icon={ChevronRight}>Weiter</ActionButton>), /<span>Weiter<\/span><svg[^>]*lucide-chevron-right/);
  assert.match(renderToStaticMarkup(<ActionButton variant="secondary" icon={ChevronLeft}>Zurück</ActionButton>), /lucide-chevron-left[^>]*><path[^>]*><\/path><\/svg><span>Zurück<\/span>/);
});

test("IconButton exposes its required accessible name, semantic variant and square target", () => {
  const markup = renderToStaticMarkup(<IconButton label="Löschen" icon={Trash2} variant="destructive" />);
  assert.match(markup, /aria-label="Löschen"/);
  assert.match(markup, /core-action-destructive/);
  assert.match(markup, /min-w-button/);
});

test("IconButton uses the outlined secondary action by default", () => {
  const markup = renderToStaticMarkup(<IconButton label="Speichern" icon={Save} />);
  assert.match(markup, /core-action-secondary/);
  assert.match(markup, /style="color:var\(--core-text\)"/);
});

test("IconButton offers a borderless ghost action with the same square target", () => {
  const markup = renderToStaticMarkup(<IconButton label="Optionen" icon={Save} variant="ghost" />);
  assert.match(markup, /core-action-ghost/);
  assert.match(markup, /min-w-button/);
});

test("CloseButton is the one named, borderless close cross and never submits a form", () => {
  const markup = renderToStaticMarkup(<CloseButton label="Schließen" className="shrink-0" />);
  assert.match(markup, /^<button type="button" aria-label="Schließen" class="core-action-ghost core-close-button shrink-0"><svg[^>]*lucide-x[^>]*aria-hidden="true"/);
});

test("IconButton offers a quiet destructive action that only turns red on hover", () => {
  const markup = renderToStaticMarkup(<IconButton label="Löschen" icon={Trash2} variant="destructive-quiet" />);
  assert.match(markup, /core-action-ghost core-action-destructive-quiet/);
  assert.match(markup, /min-w-button/);
  assert.doesNotMatch(markup, /style=/);
});

test("CrossLinkButton centralizes the compact cross-link style for buttons and anchors", () => {
  const markup = renderToStaticMarkup(
    <>
      <CrossLinkButton onSelect={() => undefined}>Alle ansehen</CrossLinkButton>
      <CrossLinkButton href="#global">Globale Einstellungen</CrossLinkButton>
    </>,
  );

  assert.match(markup, /<button type="button"[^>]*min-h-button[^>]*>Alle ansehen/);
  assert.match(markup, /<a href="#global"[^>]*min-h-button[^>]*>Globale Einstellungen/);
  assert.equal(markup.match(/lucide-chevron-right/g)?.length, 2);
  assert.match(markup, /text-core-action[^"]*hover:underline/, "Textlink in Handlungsblau, beim Hovern unterstrichen");
  assert.doesNotMatch(markup, /bg-core-subtle|hover:bg-/, "ohne Füllfläche");
});

test("CrossLinkButton leads back to the parent surface with a chevron before its label", () => {
  const markup = renderToStaticMarkup(<CrossLinkButton direction="back" onSelect={() => undefined}>Erstellen</CrossLinkButton>);

  assert.match(markup, /<button type="button"[^>]*><svg[^>]*lucide-chevron-left[\s\S]*?<\/svg>Erstellen<\/button>/);
  assert.doesNotMatch(markup, /lucide-chevron-right/);
});
