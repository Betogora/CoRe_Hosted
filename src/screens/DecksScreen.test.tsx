import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DecksScreenProps } from "../appScreenProps.ts";
import { applyLearningItemContent, createCoreDeck, createCoreNoteTypeDefinition, createLearningItemDocumentFromLegacy, createLearningItemFromEditorValue, createManualCoreDeck, saveCardEditorValue, updateLearningItemStudyState } from "../coreModel.ts";
import type { CardEditorValue, Deck } from "../coreTypes.ts";
import { DecksScreen, type DecksScreenCardPageProps } from "./DecksScreen.tsx";

function renderScreen(decks: Deck[], overrides: Partial<DecksScreenProps & DecksScreenCardPageProps> = {}) {
  const props: DecksScreenProps & DecksScreenCardPageProps = {
    decks,
    now: "2026-08-06T10:00:00.000Z",
    mediaStore: null,
    selectedDeckId: null,
    selectedCardId: null,
    onSelectDeck: () => undefined,
    onSetDeckCoreMode: () => undefined,
    onSaveCard: () => undefined,
    onSetCardStudyState: async () => null,
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
    onMoveDeck: () => null,
    onOpenCardCreation: () => undefined,
    onOpenLearn: () => undefined,
    onOpenDeckSettings: () => undefined,
    onDraftStateChange: () => undefined,
    expandedDeckIds: [],
    onSetDeckExpanded: () => undefined,
    ...overrides,
  };
  return renderToStaticMarkup(<DecksScreen {...props} />);
}

test("cards page consumes a direct query page and projects at most 50 items", () => {
  const pageCards = Array.from({ length: 51 }, (_, index) => createLearningItemFromEditorValue(
    "deck-paged",
    { cardType: "basic", front: `Seitenkarte ${index}`, back: `Antwort ${index}`, tags: [] },
    { id: `paged-card-${String(index).padStart(3, "0")}` },
  ));
  const directCard = createLearningItemFromEditorValue(
    "deck-paged",
    { cardType: "basic", front: "Direkt geladene Karte", back: "Direkte Antwort", tags: [] },
    { id: "direct-card" },
  );
  const deck = createCoreDeck({ id: "deck-paged", name: "Abfragestapel", source: "manual", cards: [] });
  const markup = renderScreen([deck], {
    selectedDeckId: deck.id,
    selectedCardId: directCard.id,
    expandedDeckIds: [deck.id],
    cardPages: {
      [deck.id]: {
        deckId: deck.id,
        items: pageCards,
        page: 4,
        pageSize: 50,
        totalCount: 501,
        query: "",
        sort: { field: "sortField", direction: "asc" },
        selectedCard: directCard,
      },
    },
  });

  assert.equal((markup.match(/data-card-row="true"/g) ?? []).length, 50);
  assert.match(markup, /Seitenkarte 49/);
  assert.doesNotMatch(markup, /Seitenkarte 50/);
  assert.match(markup, /Seite 5 von 11/);
  assert.match(markup, /data-testid="deck-card-paged-card-049"/);
  assert.match(markup, /Direkt geladene Karte/);
});

test("cards page renders sortable collapsed deck sections without learning metrics", () => {
  const originalDeck = createManualCoreDeck({
    deckName: "Biologie",
    card: { cardType: "basic", front: "<b>Was ist ATP?</b>", back: "Ein Energieträger." },
  });
  const child = createCoreDeck({ id: "deck-child", name: "Zellbiologie", source: "manual", parentDeckId: originalDeck.id, hierarchyPath: ["Biologie", "Zellbiologie"], cards: [] });
  const grandchild = createCoreDeck({ id: "deck-grandchild", name: "Organellen", source: "manual", parentDeckId: child.id, hierarchyPath: ["Biologie", "Zellbiologie", "Organellen"], cards: [] });
  const greatGrandchild = createCoreDeck({ id: "deck-great-grandchild", name: "Mitochondrien", source: "manual", parentDeckId: grandchild.id, hierarchyPath: ["Biologie", "Zellbiologie", "Organellen", "Mitochondrien"], cards: [] });
  const deeperImport = createCoreDeck({ id: "deck-deeper-import", name: "Membran", source: "anki-apkg", parentDeckId: greatGrandchild.id, hierarchyPath: ["Biologie", "Zellbiologie", "Organellen", "Mitochondrien", "Membran"], cards: [] });
  const secondRoot = createCoreDeck({ id: "deck-second-root", name: "Chemie", source: "manual", hierarchyPath: ["Chemie"], cards: [] });
  const decks = [originalDeck, child, grandchild, greatGrandchild, deeperImport, secondRoot];
  const markup = renderScreen(decks);

  assert.match(markup, /<h2[^>]*>Karten<\/h2>/);
  assert.match(markup, /data-testid="card-library-table"/);
  assert.match(markup, /Sortierfeld/);
  assert.match(markup, /Datum/);
  assert.match(markup, /aria-label="Datum aufsteigend sortieren"/);
  assert.match(markup, /aria-label="Variante aufsteigend sortieren"/);
  assert.doesNotMatch(markup, /aria-label="Varianten aufsteigend sortieren"/);
  assert.match(markup, /aria-sort="ascending"/);
  assert.match(markup, /aria-label="Karten von Biologie aufklappen"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-controls="deck-card-list-[^"]+"/);
  assert.match(markup, /data-testid="deck-toggle-[^"]+"[^>]*class="absolute inset-0[^"]*focus-visible:ring-2/);
  assert.doesNotMatch(markup, /aria-label="Lernstand für|aria-label="Gesamtfortschritt für|data-deck-count=|data-donut-/);
  assert.doesNotMatch(markup, /data-testid="deck-header-[^"]+"[^>]*class="[^"]*border-t-2/);
  assert.doesNotMatch(markup, /Was ist ATP\?/);
  assert.doesNotMatch(markup, /Ein Energieträger\./);
  assert.match(markup, /Biologie \/ Zellbiologie/);
  assert.match(markup, new RegExp('data-testid="deck-options-' + originalDeck.id + '"[^>]*class="[^"]*pointer-events-auto'));
  assert.match(markup, /core-action-ghost/);
  assert.match(markup, /data-deck-summary-row-content="responsive"/);
  assert.equal((markup.match(new RegExp(`data-testid="deck-options-${originalDeck.id}"`, "g")) ?? []).length, 1);
  assert.doesNotMatch(markup, /min-w-\[46rem\]|overflow-x-auto|sticky left-0 w-\[calc\(100dvw/);
  assert.match(markup, /<col span="2" class="w-\[5\.75rem\]"\/>/);
  assert.match(markup, /<span class="whitespace-nowrap">Sortierfeld<\/span>/);
  assert.match(markup, /core-table-header-row/);
  assert.match(markup, /core-table-header-control/);
  assert.match(markup, /text-right/);
  assert.match(markup, /justify-end/);
  assert.match(markup, /data-core-tooltip="Stapeloptionen für Biologie"/);
  assert.match(markup, /lucide-ellipsis/);
  assert.match(markup, /aria-label="Karten durchsuchen"/);
  assert.doesNotMatch(markup, /focus-within:/);
  assert.match(markup, /focus-visible:outline-none/);
  assert.doesNotMatch(markup, /Karten nach CoRe-Modus filtern|Alle Modi/);
  assert.match(markup, />Neue Karte<\/span><\/button>/);
  assert.doesNotMatch(markup, /<span[^>]*aria-live="polite"[^>]*>\d+ Karten?<\/span>/);
  assert.doesNotMatch(markup, /data-deck-drag-source/);

  for (const [deckId, depth] of [
    [originalDeck.id, 0],
    [child.id, 1],
    [grandchild.id, 2],
    [greatGrandchild.id, 3],
    [deeperImport.id, 4],
    [secondRoot.id, 0],
  ] as const) {
    assert.match(markup, new RegExp(`data-testid="deck-header-${deckId}"[^>]*data-deck-depth="${depth}"[^>]*class="core-deck-summary-row`));
  }

  const focusedMarkup = renderScreen(decks, { selectedDeckId: child.id });
  assert.match(focusedMarkup, new RegExp(`data-testid="deck-header-${child.id}"[^>]*style="background-color:var\\(--core-info-surface\\)"`));

  const expandedMarkup = renderScreen(decks, { expandedDeckIds: [originalDeck.id] });
  assert.match(expandedMarkup, /aria-label="Karten von Biologie einklappen"/);
  assert.match(expandedMarkup, /Was ist ATP\?/);
  assert.match(expandedMarkup, /<tr[^>]*class="cursor-pointer border-b border-\[var\(--core-border\)\][^"]*"[^>]*data-card-row="true"/);
  assert.doesNotMatch(expandedMarkup, /data-deck-count=|Lernstand für|Gesamtfortschritt für|data-donut-/);
  assert.match(expandedMarkup, />Nein<\/span>/);
  assert.doesNotMatch(expandedMarkup, /Mit Varianten|Ohne Varianten/);
  assert.match(expandedMarkup, /inline-block whitespace-nowrap rounded-full/);
  assert.match(expandedMarkup, />Nein<\/span><span class="grid size-\[1\.125rem\] place-items-center"><\/span>/);
});

test("card selection opens a non-modal detail aside with editor, copy and visible tools", () => {
  const originalDeck = createManualCoreDeck({
    deckName: "Biologie",
    card: { cardType: "basic", front: "Was ist ATP?", back: "Ein Energieträger." },
  });
  const card = saveCardEditorValue(originalDeck.cards[0], { cardType: "basic", front: "Welche Funktion hat ATP?", back: "Ein Energieträger.", tags: [] });
  const deck = { ...originalDeck, cards: [card] };
  const markup = renderScreen([deck], { selectedDeckId: deck.id, selectedCardId: card.id });

  assert.match(markup, /<aside[^>]*aria-label="Kartendetail"/);
  assert.match(markup, /data-testid="card-detail-backdrop"/);
  assert.match(markup, /lg:w-1\/2/);
  assert.match(markup, /Karte bearbeiten/);
  assert.match(markup, /aria-label="Karte markieren"/);
  assert.match(markup, /class="mb-5" data-card-study-state-controls="true"/);
  assert.match(markup, /aria-label="Aussetzstatus der Karte"/);
  assert.match(markup, />Nicht aussetzen</);
  assert.doesNotMatch(markup, /role="switch"/);
  assert.doesNotMatch(markup, /Aussetzen pausiert alle Varianten/);
  assert.match(markup, /aria-label="Karten-Vorderseite"/);
  assert.match(markup, /Vorschau<\/span><\/button>/);
  assert.match(markup, />Kopieren<\/button>/);
  assert.doesNotMatch(markup, /Sichere Karten-Vorschau/);
  assert.match(markup, /Version zum Wiederherstellen/);
  assert.match(markup, /<section[^>]*data-testid="card-variant-tools"/);
  assert.doesNotMatch(markup, /<details|<summary/);
  assert.match(markup, /KI-Variante erzeugen/);
  assert.match(markup, /Sendet ausschließlich den bereinigten Text von Vorder- und Rückseite an OpenRouter/);
  assert.match(markup, /Detailansicht schließen/);
});

test("cards page shows suspended rows and marked stars beside the variants badge", () => {
  const originalDeck = createManualCoreDeck({
    deckName: "Biologie",
    card: { cardType: "basic", front: "Was ist ATP?", back: "Ein Energieträger." },
  });
  const card = updateLearningItemStudyState(originalDeck.cards[0], { marked: true, suspended: true });
  const deck = { ...originalDeck, cards: [card] };
  const markup = renderScreen([deck], { expandedDeckIds: [deck.id], selectedDeckId: deck.id, selectedCardId: card.id });

  assert.match(markup, /data-suspended="true"/);
  assert.match(markup, /sr-only[^>]*> · Ausgesetzt</);
  assert.match(markup, /bg-\[var\(--core-warning-surface\)\]/);
  assert.match(markup, />Nein<\/span><span class="grid size-\[1\.125rem\] place-items-center"><svg[^>]*aria-label="Markiert"/);
  assert.match(markup, /aria-label="Markierung entfernen"/);
  const suspendControl = markup.match(/<div[^>]*aria-label="Aussetzstatus der Karte"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(suspendControl, /aria-pressed="true"[^>]*>Aussetzen/);
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

test("detail editor renders all five supported field sets", () => {
  const imageMarkup = renderEditorFor({ cardType: "basic-with-images", front: '<p>Vorne</p><img src="front-image">', back: '<p>Hinten</p><img src="back-image">', tags: [] });
  assert.match(imageMarkup, /Basic \+ Bilder/);
  assert.match(imageMarkup, /aria-label="Karten-Vorderseite"/);
  assert.match(imageMarkup, /aria-label="Karten-Rückseite"/);
  assert.match(imageMarkup, /KI-Varianten sind derzeit nur für Basic-Karten verfügbar/);

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
  const document = createLearningItemDocumentFromLegacy({
    definitionVersionId: "definition-image-occlusion",
    front: "Bild",
    back: "Antwort",
  });
  const definition = createCoreNoteTypeDefinition({ document, kind: "image-occlusion", interaction: "image-occlusion" });
  const readOnlyCard = applyLearningItemContent({ previous: basic, document, definition, reason: "migration" }).item;
  const deck = createCoreDeck({ id: "deck-import", name: "Import", source: "anki-apkg", cards: [readOnlyCard] });
  const markup = renderScreen([deck], { selectedDeckId: deck.id, selectedCardId: readOnlyCard.id });

  assert.match(markup, /title="Dieser importierte Kartentyp kann nicht kopiert werden\."/);
  assert.match(markup, /disabled=""[^>]*>.*Kopieren/s);
  assert.match(markup, /wird hier nur angezeigt und kann nicht kopiert werden/);
});
