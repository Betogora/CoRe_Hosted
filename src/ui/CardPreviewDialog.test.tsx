import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createBasicNote } from "../coreModel.ts";
import { CardPreviewDialog } from "./CardPreviewDialog.tsx";

function fixture() {
  const { note, cards } = createBasicNote("deck", "Frage", "Antwort");
  return { note, card: cards[0] };
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
});

test("CardPreviewDialog stays unmounted while closed", () => {
  const markup = renderToStaticMarkup(
    <CardPreviewDialog open={false} {...fixture()} onOpenChange={() => undefined} />,
  );
  assert.equal(markup, "");
});
