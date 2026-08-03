import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck, createLearningItemFromEditorValue, createManualCoreDeck, updateCardContent } from "../coreModel.ts";
import { DecksScreen } from "./DecksScreen.tsx";

test("deck management centralizes selected-deck actions and keeps explicit move and variant tools", () => {
  const originalDeck = createManualCoreDeck({
    deckName: "Biologie",
    card: { cardType: "basic", front: "Was ist ATP?", back: "Ein Energieträger." },
  });
  const editedCard = updateCardContent(originalDeck.cards[0], { originalFront: "Welche Funktion hat ATP?" });
  const deck = { ...originalDeck, cards: [editedCard] };
  const markup = renderToStaticMarkup(
    <DecksScreen
      decks={[deck]}
      mediaStore={null}
      selectedDeckId={deck.id}
      selectedCardId={deck.cards[0].id}
      onSelectDeck={() => undefined}
      onSelectCard={() => undefined}
      onSetDeckCoreMode={() => undefined}
      onSaveCard={() => undefined}
      onDeleteCard={async () => null}
      onUndoDeleteCard={async () => null}
      onRestoreCard={() => undefined}
      onAddVariant={() => undefined}
      onStartDeck={() => undefined}
      onDeleteDeck={async () => null}
      onRenameDeck={() => null}
      onMoveDeck={() => null}
      onOpenCardCreation={() => undefined}
      onPrepareSubdeckCreation={() => undefined}
      onOpenLearn={() => undefined}
      onOpenDeckSettings={() => undefined}
    />,
  );

  assert.match(markup, new RegExp(`data-testid="deck-move-button-${deck.id}"`));
  assert.match(markup, /aria-label="Kartenstapel durchsuchen"/);
  assert.match(markup, /aria-label="Kartenstapel nach CoRe-Modus filtern"/);
  assert.match(markup, /Biologie öffnen/);
  assert.match(markup, />Einstellungen</);
  assert.match(markup, />Lernen</);
  assert.match(markup, />Mit Varianten lernen</);
  assert.match(markup, /Version zum Wiederherstellen/);
  assert.match(markup, /Varianten und Lernwerte/);
  assert.match(markup, /<details[^>]*data-testid="card-variant-tools"/);
  const inventoryMarkup = markup.slice(0, markup.indexOf(`data-testid="deck-card-list-${deck.id}"`));
  assert.match(inventoryMarkup, /data-deck-count="new"/);
  assert.match(inventoryMarkup, /data-deck-count="due"/);
  assert.match(inventoryMarkup, /data-deck-count="total"/);
  assert.doesNotMatch(markup, /draggable=/);
});

test("deck management shows safe fallbacks for unavailable deck and card links", () => {
  const deck = createManualCoreDeck({
    deckName: "Biologie",
    card: { cardType: "basic", front: "Was ist ATP?", back: "Ein Energieträger." },
  });
  const sharedProps = {
    decks: [deck],
    mediaStore: null,
    onSelectDeck: () => undefined,
    onSelectCard: () => undefined,
    onSetDeckCoreMode: () => undefined,
    onSaveCard: () => undefined,
    onDeleteCard: async () => null,
    onUndoDeleteCard: async () => null,
    onRestoreCard: () => undefined,
    onAddVariant: () => undefined,
    onApplyVariantJson: () => undefined,
    onStartDeck: () => undefined,
    onDeleteDeck: async () => null,
    onRenameDeck: () => null,
    onMoveDeck: () => null,
    onOpenCardCreation: () => undefined,
    onPrepareSubdeckCreation: () => undefined,
    onOpenLearn: () => undefined,
    onOpenDeckSettings: () => undefined,
  };

  const missingDeckMarkup = renderToStaticMarkup(
    <DecksScreen {...sharedProps} selectedDeckId="missing-deck" selectedCardId={null} />,
  );
  assert.match(missingDeckMarkup, /Stapel nicht gefunden oder nicht verfügbar\./);
  assert.match(missingDeckMarkup, /Zu Lernen/);
  assert.match(missingDeckMarkup, /Zur Kartenverwaltung/);

  const missingCardMarkup = renderToStaticMarkup(
    <DecksScreen {...sharedProps} selectedDeckId={deck.id} selectedCardId="missing-card" />,
  );
  assert.match(missingCardMarkup, /Karte nicht gefunden oder nicht verfügbar\./);
  assert.match(missingCardMarkup, /Zum Stapel/);
  assert.match(missingCardMarkup, /Alle Karten/);
  assert.doesNotMatch(missingCardMarkup, /aria-label="Karten-Vorderseite"/);
});

function renderEditorFor(editorValue: Parameters<typeof createLearningItemFromEditorValue>[1]) {
  const card = createLearningItemFromEditorValue("deck-editor", editorValue);
  const deck = createCoreDeck({ id: "deck-editor", name: "Editor", source: "manual", cards: [card] });
  return renderToStaticMarkup(
    <DecksScreen
      decks={[deck]}
      mediaStore={null}
      selectedDeckId={deck.id}
      selectedCardId={card.id}
      onSelectDeck={() => undefined}
      onSelectCard={() => undefined}
      onSetDeckCoreMode={() => undefined}
      onSaveCard={() => undefined}
      onDeleteCard={async () => null}
      onUndoDeleteCard={async () => null}
      onRestoreCard={() => undefined}
      onAddVariant={() => undefined}
      onStartDeck={() => undefined}
      onDeleteDeck={async () => null}
      onRenameDeck={() => null}
      onMoveDeck={() => null}
      onOpenCardCreation={() => undefined}
      onPrepareSubdeckCreation={() => undefined}
      onOpenLearn={() => undefined}
      onOpenDeckSettings={() => undefined}
    />,
  );
}

test("deck editor renders type-specific reverse, cloze and multiple-choice controls", () => {
  const reverseMarkup = renderEditorFor({ cardType: "basic-reversed", front: "Vorne", back: "Hinten", tags: [] });
  assert.match(reverseMarkup, /Umgekehrt/);
  assert.match(reverseMarkup, /aria-label="Karten-Vorderseite"/);
  assert.match(reverseMarkup, /aria-label="Karten-Rückseite"/);

  const clozeMarkup = renderEditorFor({ cardType: "cloze", textWithClozes: "{{c1::ATP}}", extra: "Energie", tags: [] });
  assert.match(clozeMarkup, /aria-label="Cloze-Text"/);
  assert.match(clozeMarkup, /Lücken mit/);
  assert.match(clozeMarkup, /aria-label="Cloze-Zusatzinfo"/);

  const mcMarkup = renderEditorFor({ cardType: "multiple-choice", question: "Welche?", options: ["A", "B"], correctOptionIndex: 1, explanation: "Darum", tags: [] });
  assert.match(mcMarkup, /aria-label="Multiple-Choice-Frage"/);
  assert.match(mcMarkup, /Antwortoptionen und richtige Antwort/);
  assert.match(mcMarkup, /Option 2 als richtig markieren/);
  assert.match(mcMarkup, /Erklärung \(optional\)/);
});
