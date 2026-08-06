import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createManualCoreDeck } from "../coreModel.ts";
import { DeckSettingsScreen } from "./DeckSettingsScreen.tsx";

const deck = createManualCoreDeck({
  deckName: "Biologie",
  card: { cardType: "basic", front: "Was ist ATP?", back: "Ein Energieträger." },
});

function renderScreen(backLabel?: string) {
  return renderToStaticMarkup(
    <DeckSettingsScreen
      deck={deck}
      decks={[deck]}
      onSave={() => undefined}
      onSaveAppearance={() => undefined}
      onRenameDeck={() => null}
      onCreateSubdeck={() => undefined}
      onStartDeck={() => undefined}
      onDeleteDeck={async () => null}
      onBack={() => undefined}
      backLabel={backLabel}
    />,
  );
}

test("deck settings label the URL-derived return destination", () => {
  const decksOrigin = renderScreen("Zurück zur Kartenverwaltung");
  const directLinkFallback = renderScreen();

  assert.match(decksOrigin, /Zurück zur Kartenverwaltung/);
  assert.doesNotMatch(decksOrigin, /Zurück zu Lernen/);
  assert.match(directLinkFallback, /Zurück zu Lernen/);
});

test("deck settings show appearance and the borderless rename action in the page title", () => {
  const markup = renderScreen();

  assert.equal(markup.match(/data-testid="deck-settings-title-name"/g)?.length, 1);
  assert.match(markup, /data-testid="deck-settings-title-name"[^>]*>Biologie/);
  assert.match(markup, /data-testid="deck-settings-title-icon"[^>]*style="color:#[^;]+;border-color:#[^;]+;/);
  assert.match(markup, /<button(?=[^>]*aria-label="Stapel umbenennen")(?=[^>]*class="[^"]*border-0)(?=[^>]*data-core-tooltip="Stapel umbenennen")/);
  assert.doesNotMatch(markup, /core-heading-3[^>]*>Biologie/);
  assert.match(markup, /data-testid="deck-settings-appearance-toolbar"/);
  assert.match(markup, />Icon</);
  assert.match(markup, /aria-label="Icon auswählen"/);
  assert.match(markup, />Farbe</);
  assert.match(markup, /aria-label="Farbe auswählen"/);
  assert.match(markup, />Speichern</);
  assert.doesNotMatch(markup, /Nur dieser Stapel|Andere Stapel behalten|Stapel-Icon|Iconfarbe|Darstellung speichern|type="color"/);
});

test("deck settings own the administrative and learning actions", () => {
  const markup = renderScreen();

  assert.match(markup, />Stapelaktionen<\/h2>/);
  assert.match(markup, />Unterstapel anlegen<\/span>/);
  assert.match(markup, />Lernen<\/span>/);
  assert.match(markup, />Varianten lernen<\/span>/);
  assert.match(markup, />Löschen<\/span>/);
});
