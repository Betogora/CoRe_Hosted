import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createManualCoreDeck } from "../coreModel.ts";
import { DeckSettingsScreen } from "./DeckSettingsScreen.tsx";

const deck = createManualCoreDeck({
  deckName: "Biologie",
  card: { cardType: "basic", front: "Was ist ATP?", back: "Ein Energieträger." },
});

test("deck settings label the URL-derived return destination", () => {
  const decksOrigin = renderToStaticMarkup(
    <DeckSettingsScreen
      deck={deck}
      onSave={() => undefined}
      onSaveAppearance={() => undefined}
      onBack={() => undefined}
      backLabel="Zurück zur Kartenverwaltung"
    />,
  );
  const directLinkFallback = renderToStaticMarkup(
    <DeckSettingsScreen
      deck={deck}
      onSave={() => undefined}
      onSaveAppearance={() => undefined}
      onBack={() => undefined}
    />,
  );

  assert.match(decksOrigin, /Zurück zur Kartenverwaltung/);
  assert.doesNotMatch(decksOrigin, /Zurück zu Lernen/);
  assert.match(directLinkFallback, /Zurück zu Lernen/);
});

test("deck settings use the compact color wheel trigger instead of the native color field", () => {
  const markup = renderToStaticMarkup(
    <DeckSettingsScreen
      deck={deck}
      onSave={() => undefined}
      onSaveAppearance={() => undefined}
      onBack={() => undefined}
    />,
  );

  assert.match(markup, /aria-label="Iconfarbe auswählen"/);
  assert.doesNotMatch(markup, /type="color"|font-mono/);
});
