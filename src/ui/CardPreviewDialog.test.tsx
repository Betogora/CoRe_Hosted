import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createBasicNote } from "../coreModel.ts";
import { CardPreviewDialog } from "./CardPreviewDialog.tsx";

function fixture(reverse = false) {
  return createBasicNote("deck", "Frage", "Antwort", { reverse });
}

test("CardPreviewDialog renders the content in an accessible larger dialog with a side switch", () => {
  const markup = renderToStaticMarkup(
    <CardPreviewDialog open {...fixture()} onOpenChange={() => undefined} />,
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /Kartenvorschau/);
  assert.match(markup, /Kartendarstellung wird vorbereitet/);
  assert.match(markup, /aria-label="Kartenseite anzeigen"/);
  assert.match(markup, />Vorderseite<\/button>/);
  assert.match(markup, />Rückseite<\/button>/);
  assert.match(markup, /sm:max-h-\[92dvh\].*sm:max-w-6xl/);
  assert.doesNotMatch(markup, /Antwort anzeigen|Bewertung Gut/);
  assert.doesNotMatch(markup, /card-preview-navigation/, "eine einzelne Karte braucht keinen Kartenwechsel");
});

test("CardPreviewDialog switches between every card the draft creates", () => {
  const markup = renderToStaticMarkup(
    <CardPreviewDialog open {...fixture(true)} onOpenChange={() => undefined} />,
  );

  assert.match(markup, /aria-label="Karte in der Vorschau"/);
  assert.match(markup, /Karte 1 von 2/);
  assert.match(markup, />Vorwärts</);
  assert.match(markup, /aria-label="Vorige Karte"/);
  assert.match(markup, /aria-label="Nächste Karte"/);
});

test("CardPreviewDialog names missing required input instead of a card", () => {
  const markup = renderToStaticMarkup(
    <CardPreviewDialog open note={null} cards={[]} onOpenChange={() => undefined} />,
  );
  assert.match(markup, /Für die Vorschau fehlen noch Pflichtangaben/);
  assert.doesNotMatch(markup, /card-preview-navigation/);
});

test("CardPreviewDialog stays unmounted while closed", () => {
  const markup = renderToStaticMarkup(
    <CardPreviewDialog open={false} {...fixture()} onOpenChange={() => undefined} />,
  );
  assert.equal(markup, "");
});
