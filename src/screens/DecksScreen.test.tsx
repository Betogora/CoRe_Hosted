import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DecksScreenProps } from "../appScreenProps.ts";
import { createCoreDeck, createLearningItemFromEditorValue, createManualCoreDeck, updateCardContent } from "../coreModel.ts";
import type { CardEditorValue, Deck } from "../coreTypes.ts";
import { DecksScreen } from "./DecksScreen.tsx";

function renderScreen(decks: Deck[], overrides: Partial<DecksScreenProps> = {}) {
  const props: DecksScreenProps = {
    decks,
    mediaStore: null,
    selectedDeckId: null,
    selectedCardId: null,
    onSelectDeck: () => undefined,
    onSetDeckCoreMode: () => undefined,
    onSaveCard: () => undefined,
    onDuplicateCard: async () => null,
    onDeleteCard: async () => null,
    onUndoDeleteCard: async () => null,
    onRestoreCard: () => undefined,
    onAddVariant: () => undefined,
    onGenerateVariant: async () => ({
      variant: { front: "Neue Frage", back: "Neue Antwort" },
      model: "example/free:free",
      privacyMode: "zdr",
      usage: null,
    }),
    onStartDeck: () => undefined,
    onDeleteDeck: async () => null,
    onRenameDeck: () => null,
    onMoveDeck: () => null,
    onOpenCardCreation: () => undefined,
    onPrepareSubdeckCreation: () => undefined,
    onOpenLearn: () => undefined,
    onOpenDeckSettings: () => undefined,
    onDraftStateChange: () => undefined,
    ...overrides,
  };
  return renderToStaticMarkup(<DecksScreen {...props} />);
}

test("cards page renders sortable collapsed deck sections with direct metrics", () => {
  const originalDeck = createManualCoreDeck({
    deckName: "Biologie",
    card: { cardType: "basic", front: "<b>Was ist ATP?</b>", back: "Ein Energieträger." },
  });
  const child = createCoreDeck({ id: "deck-child", name: "Zellbiologie", source: "manual", parentDeckId: originalDeck.id, hierarchyPath: ["Biologie", "Zellbiologie"], cards: [] });
  const grandchild = createCoreDeck({ id: "deck-grandchild", name: "Organellen", source: "manual", parentDeckId: child.id, hierarchyPath: ["Biologie", "Zellbiologie", "Organellen"], cards: [] });
  const greatGrandchild = createCoreDeck({ id: "deck-great-grandchild", name: "Mitochondrien", source: "manual", parentDeckId: grandchild.id, hierarchyPath: ["Biologie", "Zellbiologie", "Organellen", "Mitochondrien"], cards: [] });
  const deeperImport = createCoreDeck({ id: "deck-deeper-import", name: "Membran", source: "anki-apkg", parentDeckId: greatGrandchild.id, hierarchyPath: ["Biologie", "Zellbiologie", "Organellen", "Mitochondrien", "Membran"], cards: [] });
  const decks = [originalDeck, child, grandchild, greatGrandchild, deeperImport];
  const markup = renderScreen(decks);

  assert.match(markup, /<h2[^>]*>Kartenverwaltung<\/h2>/);
  assert.match(markup, /data-testid="card-library-table"/);
  assert.match(markup, /Sortierfeld/);
  assert.match(markup, /Fällig/);
  assert.match(markup, /Varianten/);
  assert.match(markup, /aria-sort="ascending"/);
  assert.match(markup, /aria-label="Karten von Biologie aufklappen"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-controls="deck-card-list-[^"]+"/);
  assert.match(markup, /data-testid="deck-toggle-[^"]+"[^>]*class="absolute inset-0[^"]*focus-visible:ring-2/);
  assert.match(markup, /class="core-deck-group border-b border-t-2 border-\[var\(--core-border\)\]"/);
  assert.match(markup, /aria-label="Lernstand für Biologie"/);
  assert.doesNotMatch(markup, /Was ist ATP\?/);
  assert.doesNotMatch(markup, /Ein Energieträger\./);
  assert.match(markup, /Biologie \/ Zellbiologie/);
  assert.match(markup, new RegExp('data-testid="deck-options-' + originalDeck.id + '"[^>]*class="[^"]*pointer-events-auto'));
  assert.match(markup, /aria-label="Karten durchsuchen"/);
  assert.ok(markup.includes("focus-within:border-[var(--core-border-interactive)]"));
  assert.match(markup, /focus-visible:outline-none/);
  assert.doesNotMatch(markup, /Karten nach CoRe-Modus filtern|Alle Modi/);
  assert.match(markup, />Neue Karte<\/span><\/button>/);
  assert.doesNotMatch(markup, /data-deck-drag-source/);

  for (const [deckId, depth] of [
    [originalDeck.id, 0],
    [child.id, 1],
    [grandchild.id, 2],
    [greatGrandchild.id, 3],
    [deeperImport.id, 3],
  ] as const) {
    assert.match(markup, new RegExp(`data-testid="deck-header-${deckId}"[^>]*data-deck-depth="${depth}"[^>]*class="core-deck-group`));
  }

  const focusedMarkup = renderScreen(decks, { selectedDeckId: child.id });
  assert.match(focusedMarkup, new RegExp(`data-testid="deck-header-${child.id}"[^>]*style="background-color:var\\(--core-info-surface\\)"`));
});

test("card selection opens a non-modal detail aside with editor, copy and collapsed tools", () => {
  const originalDeck = createManualCoreDeck({
    deckName: "Biologie",
    card: { cardType: "basic", front: "Was ist ATP?", back: "Ein Energieträger." },
  });
  const card = updateCardContent(originalDeck.cards[0], { originalFront: "Welche Funktion hat ATP?" });
  const deck = { ...originalDeck, cards: [card] };
  const markup = renderScreen([deck], { selectedDeckId: deck.id, selectedCardId: card.id });

  assert.match(markup, /<aside[^>]*aria-label="Kartendetail"/);
  assert.match(markup, /lg:w-1\/2/);
  assert.match(markup, /Karte bearbeiten/);
  assert.match(markup, /aria-label="Karten-Vorderseite"/);
  assert.match(markup, />Kopieren<\/button>/);
  assert.match(markup, /Version zum Wiederherstellen/);
  assert.match(markup, /<details[^>]*data-testid="card-variant-tools"/);
  assert.match(markup, /KI-Variante erzeugen/);
  assert.match(markup, /Sendet ausschließlich den bereinigten Text von Vorder- und Rückseite an OpenRouter/);
  assert.match(markup, /Detailansicht schließen/);
});

test("cards page shows safe deterministic fallbacks for unavailable URL targets", () => {
  const deck = createManualCoreDeck({ deckName: "Biologie", card: { cardType: "basic", front: "ATP", back: "Energie" } });
  const missingDeckMarkup = renderScreen([deck], { selectedDeckId: "missing-deck" });
  assert.match(missingDeckMarkup, /Stapel nicht gefunden/);
  assert.match(missingDeckMarkup, /Zu Lernen/);
  assert.match(missingDeckMarkup, /Alle Karten/);

  const missingCardMarkup = renderScreen([deck], { selectedDeckId: deck.id, selectedCardId: "missing-card" });
  assert.match(missingCardMarkup, /Karte nicht gefunden/);
  assert.match(missingCardMarkup, /Zur Kartenliste/);
  assert.doesNotMatch(missingCardMarkup, /aria-label="Karten-Vorderseite"/);
});

function renderEditorFor(editorValue: CardEditorValue) {
  const card = createLearningItemFromEditorValue("deck-editor", editorValue);
  const deck = createCoreDeck({ id: "deck-editor", name: "Editor", source: "manual", cards: [card] });
  return renderScreen([deck], { selectedDeckId: deck.id, selectedCardId: card.id });
}

test("detail editor renders all four supported field sets", () => {
  const reverseMarkup = renderEditorFor({ cardType: "basic-reversed", front: "Vorne", back: "Hinten", tags: [] });
  assert.match(reverseMarkup, /Umgekehrt/);
  assert.match(reverseMarkup, /aria-label="Karten-Vorderseite"/);
  assert.match(reverseMarkup, /aria-label="Karten-Rückseite"/);
  assert.match(reverseMarkup, /disabled=""[^>]*>.*KI-Variante erzeugen/s);
  assert.match(reverseMarkup, /KI-Varianten sind derzeit nur für Basic-Karten verfügbar/);

  const clozeMarkup = renderEditorFor({ cardType: "cloze", textWithClozes: "{{c1::ATP}}", extra: "Energie", tags: [] });
  assert.match(clozeMarkup, /aria-label="Cloze-Text"/);
  assert.match(clozeMarkup, /aria-label="Cloze-Zusatzinfo"/);

  const mcMarkup = renderEditorFor({ cardType: "multiple-choice", question: "Welche?", options: ["A", "B"], correctOptionIndex: 1, explanation: "Darum", tags: [] });
  assert.match(mcMarkup, /aria-label="Multiple-Choice-Frage"/);
  assert.match(mcMarkup, /Antwortoptionen und richtige Antwort/);
  assert.match(mcMarkup, /Option 2 als richtig markieren/);
});

test("copy is disabled with a reason for read-only imported card types", () => {
  const basic = createLearningItemFromEditorValue("deck-import", { cardType: "basic", front: "Bild", back: "Antwort", tags: [] });
  const readOnlyCard = { ...basic, cardType: "image-occlusion" as const, kind: "image-occlusion" as const };
  const deck = createCoreDeck({ id: "deck-import", name: "Import", source: "anki-apkg", cards: [readOnlyCard] });
  const markup = renderScreen([deck], { selectedDeckId: deck.id, selectedCardId: readOnlyCard.id });

  assert.match(markup, /title="Dieser importierte Kartentyp kann nicht kopiert werden\."/);
  assert.match(markup, /disabled=""[^>]*>.*Kopieren/s);
  assert.match(markup, /wird hier nur angezeigt und kann nicht kopiert werden/);
});
