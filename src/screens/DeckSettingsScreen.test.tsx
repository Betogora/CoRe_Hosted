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
      onRenameDeck={() => null}
      onBack={() => undefined}
      backLabel="Zurück zur Kartenverwaltung"
    />,
  );
  const directLinkFallback = renderToStaticMarkup(
    <DeckSettingsScreen
      deck={deck}
      onSave={() => undefined}
      onSaveAppearance={() => undefined}
      onRenameDeck={() => null}
      onBack={() => undefined}
    />,
  );

  assert.match(decksOrigin, /Zurück zur Kartenverwaltung/);
  assert.doesNotMatch(decksOrigin, /Zurück zu Lernen/);
  assert.match(directLinkFallback, /Zurück zu Lernen/);
});

test("deck settings use the compact title toolbar and remove the explanatory appearance form", () => {
  const markup = renderToStaticMarkup(
    <DeckSettingsScreen
      deck={deck}
      onSave={() => undefined}
      onSaveAppearance={() => undefined}
      onRenameDeck={() => null}
      onBack={() => undefined}
    />,
  );

  assert.match(markup, /core-heading-3[^>]*>Biologie/);
  assert.match(markup, /aria-label="Stapel umbenennen"/);
  assert.match(markup, />Icon</);
  assert.match(markup, /aria-label="Icon auswählen"/);
  assert.match(markup, />Farbe</);
  assert.match(markup, /aria-label="Farbe auswählen"/);
  assert.match(markup, />Speichern</);
  assert.doesNotMatch(markup, /Nur dieser Stapel|Andere Stapel behalten|Stapel-Icon|Iconfarbe|Darstellung speichern|type="color"/);
});
