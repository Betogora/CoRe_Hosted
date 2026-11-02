import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { CardEditorServices, DecksScreenProps } from "../appScreenProps.ts";
import { addCardVariant, addNoteField, createBasicNote, createCoreDeck, createManualNoteContent, createNote, setCardSuspended, setNoteMarked, type ManualNoteInput } from "../coreModel.ts";
import type { Deck } from "../coreTypes.ts";
import type { DeckLibrarySummary } from "../libraryModel.ts";
import { summarizeDeckReview } from "../scheduler.ts";
import { catalogEntryFromCard, type NoteGraph } from "../workspaceReplica.ts";
import { DecksScreen, type DecksCardPage } from "./DecksScreen.tsx";

const NOW = "2026-08-06T10:00:00.000Z";
const SORT = { field: "sortField", direction: "asc" } as const;

function basicGraph(deckId: string, front: string, back: string, { reverse = false, cardId }: { reverse?: boolean; cardId?: string } = {}): NoteGraph {
  const graph = createBasicNote(deckId, front, back, { reverse });
  return cardId ? { ...graph, cards: graph.cards.map((card, index) => index === 0 ? { ...card, id: cardId } : card) } : graph;
}

function manualGraph(deckId: string, input: ManualNoteInput): NoteGraph {
  return createNote({ deckId, content: createManualNoteContent(input) });
}

function deckOf(id: string, name: string, graphs: NoteGraph[], extra: Partial<Parameters<typeof createCoreDeck>[0]> = {}): Deck {
  return createCoreDeck({ id, name, source: "manual", cards: graphs.flatMap((graph) => graph.cards), ...extra });
}

function cardPage(deckId: string, graphs: NoteGraph[], { totalCount, page = 0, selected = null }: { totalCount?: number; page?: number; selected?: DecksCardPage["selected"] } = {}): DecksCardPage {
  const items = graphs.flatMap((graph) => graph.cards.map((card) => catalogEntryFromCard(card, graph.note)));
  return { deckId, items, page, pageSize: 50, totalCount: totalCount ?? items.length, query: "", sort: SORT, selected };
}

function selectedOf(graph: NoteGraph, cardId = graph.cards[0].id) {
  return { ...graph, cardId };
}

function summaryWithTotal(deck: Deck, totalCards: number): DeckLibrarySummary {
  return {
    inventory: { ...summarizeDeckReview(deck, NOW), totalCards },
    dailyProgress: { completedTodayCount: 0, newCount: 0, inProgressCount: 0, dueCount: 0, total: 0 },
    startableCount: 0,
    additionalNewCount: 0,
    effectiveNewLimit: 20,
    introducedTodayCount: 0,
    dateKey: "2026-08-06",
  };
}

const CARD_EDITOR_SERVICES: CardEditorServices = {
  flagNames: [],
  moveCard: async () => null,
  resetCards: async () => [],
  setCardsLeech: async () => [],
  buryCards: async () => [],
  restoreCardStudies: async () => [],
  editVariant: async () => undefined,
  removeNoteMedia: async () => null,
  loadCard: async () => null,
  listReviewEvents: async () => [],
  listTagDirectory: async () => [],
  listExamsForDeck: async () => [],
  prefetchCard: () => undefined,
  cloud: null,
  openFlagNames: () => undefined,
  openSyncConflicts: () => undefined,
};

function renderScreen(decks: Deck[], overrides: Partial<DecksScreenProps> = {}) {
  const props: DecksScreenProps = {
    decks,
    contentTab: "cards",
    onStartDeck: () => undefined,
    now: NOW,
    mediaStore: null,
    selectedDeckId: null,
    selectedCardId: null,
    cardEditorTab: "general",
    onCardEditorTabChange: () => undefined,
    cardEditor: CARD_EDITOR_SERVICES,
    onSelectDeck: () => undefined,
    onSetDeckCoreMode: () => undefined,
    onSaveNote: async () => null,
    onSetCardStudyState: async () => null,
    onDuplicateNote: async () => null,
    onDeleteNote: async () => null,
    onUndoDeleteNote: async () => null,
    onRescheduleCards: async () => [],
    onGenerateVariant: async () => ({
      variant: { front: "Neue Frage", back: "Neue Antwort" },
      model: "example/free:free",
      privacyMode: "zdr",
      usage: null,
    }),
    onUpdateVariant: async () => undefined,
    onMoveDeck: () => null,
    onOpenLearn: () => undefined,
    onOpenDeckContent: () => undefined,

    onOpenCardSettings: () => undefined,
    onOpenDeckSettings: () => undefined,
    onDraftStateChange: () => undefined,
    expandedDeckIds: [],
    onSetDeckExpanded: () => undefined,
    ...overrides,
  };
  return renderToStaticMarkup(<DecksScreen {...props} />);
}

test("deck content shows only its own cards without deck headings and uses the existing editor", () => {
  const atp = basicGraph("deck-bio", "Was ist ATP?", "Ein Energieträger.");
  const water = basicGraph("deck-chem", "Was ist H2O?", "Wasser.");
  const deck = deckOf("deck-bio", "Biologie", [atp]);
  const other = deckOf("deck-chem", "Chemie", [water]);
  const cardPages = { [deck.id]: cardPage(deck.id, [atp]), [other.id]: cardPage(other.id, [water]) };
  const markup = renderScreen([deck, other], { contentDeckId: deck.id, selectedDeckId: deck.id, cardPages });
  assert.doesNotMatch(markup, /data-testid="deck-explorer"|Stapel wechseln/);
  assert.doesNotMatch(renderScreen([deck, other], { cardPages }), /data-testid="deck-explorer"|Stapel wechseln/);
  assert.match(markup, /aria-label="Stapelinhalte"/);
  for (const label of ["Unterstapel", "Zusammenfassungen", "Quiz", "Mind Map", "Karten", "Quelle"]) assert.match(markup, new RegExp(`aria-label="${label}"`));
  assert.match(markup, /aria-label="Karten nach Variante filtern"/);
  assert.match(markup, />Ohne Variante</);
  assert.doesNotMatch(markup, /Für diese Karten Varianten generieren/, "the generation action appears only while the filter is on");
  assert.match(markup, /Was ist ATP\?/);
  assert.doesNotMatch(markup, /Was ist H2O|Aktive Stapel|Bereich in Lernen|deck-toggle-|deck-header-/);
  assert.match(markup, /data-testid="deck-content-study"[^>]*>[\s\S]*?Karten lernen/);
  const actions = markup.slice(markup.indexOf('data-testid="deck-content-actions"'));
  assert.ok(actions.indexOf('aria-label="Stapelinhalte"') < actions.indexOf('data-testid="deck-content-study"'));
  assert.doesNotMatch(markup.slice(markup.indexOf('data-testid="deck-content-heading"'), markup.indexOf('data-testid="deck-content-actions"')), /data-testid="deck-content-study"/);
  assert.doesNotMatch(markup, /core-deck-content-study/);
  assert.match(markup, /aria-label="Karten durchsuchen"/);
  const editor = renderScreen([deck, other], {
    contentDeckId: deck.id,
    selectedDeckId: deck.id,
    selectedCardId: atp.cards[0].id,
    cardPages: { ...cardPages, [deck.id]: cardPage(deck.id, [atp], { selected: selectedOf(atp) }) },
  });
  assert.match(editor, /data-testid="card-detail-dialog"/);
  assert.match(editor, /aria-label="Bereiche der Karte"/);
  assert.match(editor, /Speichern|Vorschau|Kopieren|Löschen|Varianten/);
});

test("deck content opens on its subdecks with path, heading and branch actions", () => {
  const root = deckOf("root", "Hauptstapel", []);
  const child = deckOf("child", "Kapitel", [basicGraph("child", "Frage", "Antwort")], { parentDeckId: root.id, hierarchyPath: ["Hauptstapel", "Kapitel"] });
  const grandchild = deckOf("grandchild", "Abschnitt", [], { parentDeckId: child.id, hierarchyPath: ["Hauptstapel", "Kapitel", "Abschnitt"] });
  const markup = renderScreen([root, child, grandchild], { contentDeckId: child.id, contentTab: undefined });

  assert.match(markup, /<nav[^>]*aria-label="Stapelpfad"[\s\S]*>Alle Stapel<[\s\S]*>Hauptstapel<[\s\S]*aria-current="page">Kapitel</);
  assert.match(markup, /<h2[^>]*data-screen-heading[^>]*>Kapitel<\/h2>/);
  assert.match(markup, /aria-label="Eine Ebene zurück"/);
  assert.match(markup, /aria-pressed="true"[^>]*aria-label="Unterstapel"|aria-label="Unterstapel"[^>]*aria-pressed="true"/);
  assert.match(markup, /data-testid="deck-content-substacks"/);
  assert.match(markup, /data-testid="content-substack-grandchild"/);
  assert.match(markup, /aria-label="Stapel Hauptstapel \/ Kapitel \/ Abschnitt öffnen"/);
  assert.match(markup, />Alle Karten dieses Zweigs</);
  assert.match(markup, />Diesen Zweig lernen</);
  assert.doesNotMatch(markup, /data-testid="card-library-panel"|Einschließlich|direkte Unterstapel|data-donut-/);

  const leaf = renderScreen([root, child, grandchild], { contentDeckId: grandchild.id, contentTab: "children" });
  assert.match(leaf, />Keine weiteren Unterstapel</);
  assert.match(leaf, />Karten öffnen</);
  const top = renderScreen([root, child], { contentDeckId: root.id, contentTab: "summary" });
  assert.match(top, /aria-label="Zur Stapelübersicht"/);
  assert.match(top, /data-testid="deck-summaries-panel"/);
  const mindMap = renderScreen([root, child], { contentDeckId: root.id, contentTab: "mind-map" });
  assert.match(mindMap, /Mindmap wird geladen/);
});

test("substack tree starts collapsed and keeps other branches outside the opened deck", () => {
  const root = deckOf("root", "Hauptstapel", []);
  const child = deckOf("child", "Kapitel", [], { parentDeckId: root.id, hierarchyPath: ["Hauptstapel", "Kapitel"] });
  const grandchild = deckOf("grandchild", "Abschnitt", [], { parentDeckId: child.id, hierarchyPath: ["Hauptstapel", "Kapitel", "Abschnitt"] });
  const other = deckOf("other", "Anderer Stapel", []);
  const markup = renderScreen([root, child, grandchild, other], { contentDeckId: root.id, contentTab: "children" });
  assert.match(markup, /data-testid="content-substack-child"/);
  assert.doesNotMatch(markup, /data-testid="content-substack-(grandchild|other|root)"/);
  assert.match(markup, /aria-label="Stapel Hauptstapel \/ Kapitel aufklappen" aria-expanded="false"/);
  assert.match(markup, /aria-label="Unterstapel von Hauptstapel \/ Kapitel anzeigen"/);
  assert.match(markup, /aria-label="Karten von Hauptstapel \/ Kapitel öffnen"/);
});

test("deck learning is disabled only for an empty deck, including the paged catalog", () => {
  const deck = deckOf("empty", "Leer", []);
  const empty = renderScreen([deck], { contentDeckId: deck.id });
  assert.match(empty, /<button(?=[^>]*disabled="")(?=[^>]*data-testid="deck-content-study")/);
  const catalog = renderScreen([deck], { contentDeckId: deck.id, cardPages: {}, deckSummaries: new Map([[deck.id, summaryWithTotal(deck, 60)]]) });
  assert.doesNotMatch(catalog, /<button(?=[^>]*disabled="")(?=[^>]*data-testid="deck-content-study")/);
  assert.match(catalog, /data-testid="deck-content-study"/);
  const child = deckOf("child", "Unterstapel", [basicGraph("child", "Frage", "Antwort")], { parentDeckId: deck.id });
  const subtree = renderScreen([deck, child], { contentDeckId: deck.id });
  assert.doesNotMatch(subtree, /<button(?=[^>]*disabled="")(?=[^>]*data-testid="deck-content-study")/);
  assert.doesNotMatch(renderScreen([deck]), /data-testid="deck-content-study"/);
});

test("deck content includes its complete subtree without its parent or other branches", () => {
  const parentGraph = basicGraph("parent", "Elternkarte", "Antwort");
  const selectedGraph = basicGraph("selected", "Eigene Karte", "Antwort");
  const childGraph = basicGraph("child", "Nachfahrenkarte", "Antwort");
  const grandchildGraph = basicGraph("grandchild", "Tiefe Karte", "Antwort");
  const siblingGraph = basicGraph("sibling", "Andere Karte", "Antwort");
  const parent = deckOf("parent", "Elternstapel", [parentGraph]);
  const selected = deckOf("selected", "Unterstapel", [selectedGraph], { parentDeckId: parent.id, hierarchyPath: ["Elternstapel", "Unterstapel"] });
  const child = deckOf("child", "Nachfahre", [childGraph], { parentDeckId: selected.id, hierarchyPath: ["Elternstapel", "Unterstapel", "Nachfahre"] });
  const grandchild = deckOf("grandchild", "Tiefer Unterstapel", [grandchildGraph], { parentDeckId: child.id });
  const sibling = deckOf("sibling", "Andere Verzweigung", [siblingGraph], { parentDeckId: parent.id });
  const decks = [parent, selected, child, grandchild, sibling];
  const cardPages = {
    parent: cardPage("parent", [parentGraph]),
    selected: cardPage("selected", [selectedGraph]),
    child: cardPage("child", [childGraph]),
    grandchild: cardPage("grandchild", [grandchildGraph]),
    sibling: cardPage("sibling", [siblingGraph]),
  };
  const markup = renderScreen(decks, { contentDeckId: selected.id, selectedDeckId: selected.id, cardPages });
  assert.match(markup, /Eigene Karte/);
  assert.match(markup, /Nachfahrenkarte/);
  assert.match(markup, /Tiefe Karte/);
  assert.doesNotMatch(markup, /Elternkarte|Andere Karte/);
  for (const deck of [selected, child, grandchild]) {
    assert.match(markup, new RegExp(`data-testid="deck-header-${deck.id}"`));
    assert.match(markup, new RegExp(`data-testid="deck-toggle-${deck.id}"[^>]*aria-expanded="true"`));
  }
  const emptyParent = renderScreen(decks.map((deck) => deck.id === selected.id ? { ...deck, cards: [] } : deck), {
    contentDeckId: selected.id,
    cardPages: { ...cardPages, selected: cardPage("selected", []) },
  });
  assert.match(emptyParent, /Nachfahrenkarte/);
  assert.match(emptyParent, /Tiefe Karte/);
  const editor = renderScreen(decks, {
    contentDeckId: selected.id,
    selectedDeckId: selected.id,
    selectedCardId: grandchildGraph.cards[0].id,
    cardPages: { ...cardPages, grandchild: cardPage("grandchild", [grandchildGraph], { selected: selectedOf(grandchildGraph) }) },
  });
  assert.match(editor, /data-testid="card-detail-dialog"/);
  assert.match(editor, /aria-label="Bereiche der Karte"/);
  assert.doesNotMatch(editor, /Karte nicht gefunden/);
});

test("deck content renders paged subdecks and resolves a direct card link to its owning deck", () => {
  const root = deckOf("root", "Hauptstapel", []);
  const graph = basicGraph("child", "Katalog-Unterkarte", "Antwort");
  const child = deckOf("child", "Unterstapel", [], { parentDeckId: root.id });
  const markup = renderScreen([root, child], {
    contentDeckId: root.id,
    selectedDeckId: root.id,
    selectedCardId: graph.cards[0].id,
    cardPages: {
      [root.id]: cardPage(root.id, []),
      [child.id]: cardPage(child.id, [graph], { totalCount: 60, selected: selectedOf(graph) }),
    },
  });
  assert.match(markup, /Katalog-Unterkarte/);
  assert.match(markup, /Seite 1 von 2/);
  assert.match(markup, /data-testid="card-detail-dialog"/);
  assert.match(markup, /aria-label="Bereiche der Karte"/);

  const edited = {
    ...graph,
    note: setNoteMarked({
      ...graph.note,
      content: { ...graph.note.content, fields: graph.note.content.fields.map((field) => field.id === "front" ? { ...field, html: "Aktualisierte Unterkarte" } : field) },
    }, true),
  };
  const updatedMarkup = renderScreen([root, child], {
    contentDeckId: root.id,
    selectedDeckId: root.id,
    selectedCardId: edited.cards[0].id,
    cardPages: {
      [root.id]: cardPage(root.id, []),
      [child.id]: cardPage(child.id, [edited], { totalCount: 60, selected: selectedOf(edited) }),
    },
  });
  const detailMarkup = updatedMarkup.slice(updatedMarkup.indexOf('data-testid="card-detail-dialog"'));
  assert.match(updatedMarkup, /Aktualisierte Unterkarte/);
  assert.match(detailMarkup, /aria-label="Markierung entfernen"/);
});

test("deck content preserves the paged catalog path without requiring group expansion", () => {
  const graph = basicGraph("deck-bio", "Katalogkarte", "Antwort");
  const deck = deckOf("deck-bio", "Biologie", []);
  const markup = renderScreen([deck], {
    contentDeckId: deck.id,
    selectedDeckId: deck.id,
    cardPages: { [deck.id]: cardPage(deck.id, [graph], { totalCount: 60 }) },
  });
  assert.match(markup, /Katalogkarte/);
  assert.match(markup, /Seite 1 von 2/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*aria-label="Vorherige Seite anzeigen"/);
  assert.match(markup, /aria-label="Nächste Seite anzeigen"/);
  assert.match(markup, /class="core-body [^"]*">Seite 1 von 2/);
  assert.doesNotMatch(markup, /deck-toggle-|Aktive Stapel/);
});

test("cards page consumes a direct query page and projects at most 50 items", () => {
  const pageGraphs = Array.from({ length: 51 }, (_, index) => basicGraph("deck-paged", `Seitenkarte ${index}`, `Antwort ${index}`, { cardId: `paged-card-${String(index).padStart(3, "0")}` }));
  const directGraph = basicGraph("deck-paged", "Direkt geladene Karte", "Direkte Antwort", { cardId: "direct-card" });
  const deck = deckOf("deck-paged", "Abfragestapel", []);
  const markup = renderScreen([deck], {
    selectedDeckId: deck.id,
    selectedCardId: "direct-card",
    expandedDeckIds: [deck.id],
    cardPages: {
      [deck.id]: cardPage(deck.id, [...pageGraphs.slice(0, 49), directGraph, ...pageGraphs.slice(49)], { page: 4, totalCount: 501, selected: selectedOf(directGraph) }),
    },
  });

  assert.equal((markup.match(/data-card-row="true"/g) ?? []).length, 50);
  assert.match(markup, /Seitenkarte 48/);
  assert.doesNotMatch(markup, /Seitenkarte 49|Seitenkarte 50/);
  assert.match(markup, /Seite 5 von 11/);
  assert.match(markup, /data-testid="deck-card-direct-card"/);
  assert.match(markup, /Direkt geladene Karte/);
});

test("cards page ignores catalog pages for another query or sort", () => {
  const graph = basicGraph("deck-query", "Gefilterte Karte", "Antwort");
  const deck = deckOf("deck-query", "Suche", []);
  const page = cardPage(deck.id, [graph]);
  const render = (candidate: DecksCardPage) => renderScreen([deck], { expandedDeckIds: [deck.id], cardPages: { [deck.id]: candidate } });

  assert.match(render(page), /Gefilterte Karte/);
  assert.doesNotMatch(render({ ...page, query: "gefiltert" }), /Gefilterte Karte/);
  assert.doesNotMatch(render({ ...page, sort: { field: "nextStudyDate", direction: "asc" } }), /Gefilterte Karte/);
});

test("cards page renders sortable collapsed deck sections without learning metrics", () => {
  const atp = basicGraph("deck-bio", "<b>Was ist ATP?</b>", "Ein Energieträger.");
  const originalDeck = deckOf("deck-bio", "Biologie", [atp]);
  const child = createCoreDeck({ id: "deck-child", name: "Zellbiologie", source: "manual", parentDeckId: originalDeck.id, hierarchyPath: ["Biologie", "Zellbiologie"], cards: [] });
  const grandchild = createCoreDeck({ id: "deck-grandchild", name: "Organellen", source: "manual", parentDeckId: child.id, hierarchyPath: ["Biologie", "Zellbiologie", "Organellen"], cards: [] });
  const greatGrandchild = createCoreDeck({ id: "deck-great-grandchild", name: "Mitochondrien", source: "manual", parentDeckId: grandchild.id, hierarchyPath: ["Biologie", "Zellbiologie", "Organellen", "Mitochondrien"], cards: [] });
  const deeperImport = createCoreDeck({ id: "deck-deeper-import", name: "Membran", source: "anki-apkg", parentDeckId: greatGrandchild.id, hierarchyPath: ["Biologie", "Zellbiologie", "Organellen", "Mitochondrien", "Membran"], cards: [] });
  const secondRoot = createCoreDeck({ id: "deck-second-root", name: "Chemie", source: "manual", hierarchyPath: ["Chemie"], cards: [] });
  const decks = [originalDeck, child, grandchild, greatGrandchild, deeperImport, secondRoot];
  const cardPages = { [originalDeck.id]: cardPage(originalDeck.id, [atp]) };
  const markup = renderScreen(decks, { cardPages });

  assert.match(markup, /<h2[^>]*>Lernen<\/h2>/);
  assert.match(markup, /aria-label="Bereich in Lernen"/);
  assert.match(markup, /aria-pressed="false"[^>]*>Stapelübersicht<\/button>/);
  assert.match(markup, /aria-pressed="true"[^>]*>Kartenverwaltung<\/button>/);
  assert.match(markup, /<h3[^>]*>Aktive Stapel<\/h3>/);
  assert.match(markup, /data-testid="card-library-panel"/);
  assert.match(markup, /data-testid="card-library-table"/);
  assert.ok(markup.indexOf("Aktive Stapel") < markup.indexOf("Karten durchsuchen"));
  assert.ok(markup.indexOf("Karten durchsuchen") < markup.indexOf('aria-label="Karten durchsuchen"'));
  assert.ok(markup.indexOf('aria-label="Karten durchsuchen"') < markup.indexOf('data-testid="card-library-table"'));
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
  assert.match(markup, /<col class="w-20 sm:w-\[5\.75rem\]"\/><col class="w-20"\/>/);
  assert.match(markup, /aria-label="Sortierfeld aufsteigend sortieren"/);
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
  assert.doesNotMatch(markup, />Neue Karte<\/span><\/button>/);
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

  const focusedMarkup = renderScreen(decks, { selectedDeckId: child.id, cardPages });
  assert.match(focusedMarkup, new RegExp(`data-testid="deck-header-${child.id}"[^>]*style="background-color:var\\(--core-info-surface\\)"`));

  const expandedMarkup = renderScreen(decks, { expandedDeckIds: [originalDeck.id], cardPages });
  assert.match(expandedMarkup, /aria-label="Karten von Biologie einklappen"/);
  assert.match(expandedMarkup, /Was ist ATP\?/);
  assert.doesNotMatch(expandedMarkup, /<b>/);
  assert.match(expandedMarkup, /<tr[^>]*class="cursor-pointer border-b border-core-border[^"]*"[^>]*data-card-row="true"/);
  assert.doesNotMatch(expandedMarkup, /data-deck-count=|Lernstand für|Gesamtfortschritt für|data-donut-/);
  assert.match(expandedMarkup, /aria-label="Keine Variante"/);
  assert.doesNotMatch(expandedMarkup, /Mit Varianten|Ohne Varianten/);
  assert.doesNotMatch(expandedMarkup, /inline-block whitespace-nowrap rounded-round/);
  assert.match(expandedMarkup, /aria-label="Keine Variante"[\s\S]*?<span class="grid size-\[1\.125rem\] place-items-center"><\/span>/);
});

test("cards page caps visual depth at level six and keeps deeper decks expandable", () => {
  const deepDecks = Array.from({ length: 7 }, (_, index) => createCoreDeck({
    id: `cards-depth-${index + 1}`,
    name: `Ebene ${index + 1}`,
    parentDeckId: index === 0 ? null : `cards-depth-${index}`,
    hierarchyPath: Array.from({ length: index + 1 }, (__, pathIndex) => `Ebene ${pathIndex + 1}`),
    source: "manual",
    cards: [],
  }));
  const markup = renderScreen(deepDecks);

  assert.match(markup, /data-testid="deck-header-cards-depth-7"[^>]*data-deck-depth="5"/);
  assert.match(markup, /aria-label="Karten von [^"]*Ebene 6 aufklappen"/);
});

test("card selection opens the full-surface editor dialog with header, tabs and the general tab", () => {
  const graph = basicGraph("deck-bio", "Welche Funktion hat ATP?", "Ein Energieträger.");
  const card = { ...graph.cards[0], study: { ...graph.cards[0].study, state: "review" as const, reps: 3, dueAt: "2026-08-05T04:00:00.000Z" } };
  const selected = { ...graph, cards: [card] };
  const deck = deckOf("deck-bio", "Biologie", [selected]);
  const markup = renderScreen([deck], {
    expandedDeckIds: [deck.id],
    selectedDeckId: deck.id,
    selectedCardId: card.id,
    dayStartHour: 4,
    timeZone: "Europe/Berlin",
    cardPages: { [deck.id]: cardPage(deck.id, [selected], { selected: selectedOf(selected) }) },
  });

  assert.match(markup, /role="dialog" aria-modal="true" aria-labelledby="[^"]+-title"[^>]*data-testid="card-detail-dialog"/);
  assert.match(markup, /data-testid="card-detail-backdrop"/);
  assert.doesNotMatch(markup, /<aside|lg:w-1\/2/);
  assert.match(markup, /<h2[^>]*>Welche Funktion hat ATP\?<\/h2>/);
  assert.match(markup, /data-testid="card-sibling-position">Frage und Antwort</);
  assert.match(markup, /<button[^>]*disabled=""[^>]*aria-label="Vorige Karte"/);
  assert.match(markup, /aria-label="Karte 1 von 1">1 \/ 1</);
  for (const label of ["Duplizieren", "Löschen", "Detailansicht schließen"]) assert.match(markup, new RegExp(`aria-label="${label}"`));
  const tabs = markup.match(/<div role="tablist"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.deepEqual([...tabs.matchAll(/role="tab"[^>]*><span[^>]*>([^<]+)/g)].map((match) => match[1]), ["Allgemein", "Inhalt", "Varianten", "Lernen"]);
  assert.match(tabs, /aria-selected="true"[^>]*><span[^>]*>Allgemein/);
  assert.match(markup, /data-testid="card-general-tab"/);
  assert.match(markup, /aria-label="Flagge Rot"/);
  assert.match(markup, /aria-label="Karte markieren"/);
  assert.match(markup, /data-testid="card-plan-state">Fällig am 05\.08\.2026</);
  assert.match(markup, /data-core-date-picker="trigger"/);
  assert.doesNotMatch(markup, />Neu planen</, "Neu planen erscheint erst nach einer Datumsänderung");
  assert.match(markup, /aria-pressed="false"[^>]*><svg[^>]*>[\s\S]*?<\/svg>Aussetzen/);
  assert.match(markup, />Zurückstellen</);
  assert.match(markup, />Verschieben</);
  assert.match(markup, /Tags bearbeiten/);
  assert.match(markup, /data-testid="card-details"/);
  assert.match(markup, /aria-label="Karten-ID kopieren"/);
  assert.doesNotMatch(markup, /Ähnliche Inhalte/, "ohne Cloud entfällt der Bereich");
  assert.doesNotMatch(markup, /aria-label="Feld Vorderseite"|data-testid="card-variant-tools"/, "nur der geöffnete Reiter wird geladen");
  assert.doesNotMatch(markup, /Karten entfernen\?|Karte löschen\?|Synchronisierung klären/);
});

test("from a session the editor opens without a hit list", () => {
  const graph = basicGraph("deck-bio", "Was ist ATP?", "Ein Energieträger.");
  const deck = deckOf("deck-bio", "Biologie", [graph]);
  const markup = renderScreen([deck], {
    selectedDeckId: deck.id,
    selectedCardId: graph.cards[0].id,
    cardEditorTab: "content",
    onCloseSelectedCard: () => undefined,
    cardPages: { [deck.id]: cardPage(deck.id, [graph], { selected: selectedOf(graph) }) },
  });
  assert.doesNotMatch(markup, /data-testid="card-hit-navigation"/);
  assert.match(markup, /aria-selected="true"[^>]*><span[^>]*>Inhalt/);
  assert.match(markup, /data-testid="card-content-tab"/);
});

test("prev and next walk the loaded hits and load the neighbouring page at a page end", () => {
  const graphs = ["Erste", "Zweite", "Dritte"].map((front) => basicGraph("deck-bio", front, "Antwort"));
  const deck = deckOf("deck-bio", "Biologie", graphs);
  const page = (selected: NoteGraph) => ({ [deck.id]: cardPage(deck.id, graphs, { totalCount: 53, selected: selectedOf(selected) }) });
  const middle = renderScreen([deck], { expandedDeckIds: [deck.id], selectedDeckId: deck.id, selectedCardId: graphs[1].cards[0].id, cardPages: page(graphs[1]) });
  assert.match(middle, /aria-label="Karte 2 von 53">2 \/ 53</);
  assert.doesNotMatch(middle, /<button[^>]*disabled=""[^>]*aria-label="(Vorige|Nächste) Karte"/);
  const last = renderScreen([deck], { expandedDeckIds: [deck.id], selectedDeckId: deck.id, selectedCardId: graphs[2].cards[0].id, cardPages: page(graphs[2]) });
  assert.doesNotMatch(last, /<button[^>]*disabled=""[^>]*aria-label="Nächste Karte"/, "am Seitenende lädt Weiter die nächste Seite");
  const only = renderScreen([deck], { expandedDeckIds: [deck.id], selectedDeckId: deck.id, selectedCardId: graphs[2].cards[0].id, cardPages: { [deck.id]: cardPage(deck.id, graphs, { selected: selectedOf(graphs[2]) }) } });
  assert.match(only, /<button[^>]*disabled=""[^>]*aria-label="Nächste Karte"/);
});
test("cards page shows suspended rows and marked stars; the editor tints only a marked card", () => {
  const graph = basicGraph("deck-bio", "Was ist ATP?", "Ein Energieträger.");
  const marked = { note: setNoteMarked(graph.note, true), cards: [setCardSuspended({ ...graph.cards[0], ankiFlag: 2 }, true)] };
  const deck = deckOf("deck-bio", "Biologie", [marked]);
  const markup = renderScreen([deck], {
    expandedDeckIds: [deck.id],
    selectedDeckId: deck.id,
    selectedCardId: marked.cards[0].id,
    cardPages: { [deck.id]: cardPage(deck.id, [marked], { selected: selectedOf(marked) }) },
  });

  assert.match(markup, /data-suspended="true"/);
  assert.match(markup, /sr-only[^>]*> · Ausgesetzt</);
  assert.match(markup, /aria-label="Keine Variante"[\s\S]*?<span class="grid size-\[1\.125rem\] place-items-center"><svg[^>]*aria-label="Markiert"/);
  const dialog = markup.match(/<div[^>]*data-testid="card-detail-dialog"[^>]*>/)?.[0] ?? "";
  assert.match(dialog, /data-marked="true"/);
  assert.match(dialog, /bg-core-marked-soft/);
  assert.match(dialog, /--core-text-muted:var\(--core-marked-text-muted\)/);
  assert.doesNotMatch(dialog, /warning-surface/, "Aussetzen färbt keine Fläche");
  const icons = markup.slice(markup.indexOf('data-testid="card-status-icons"'), markup.indexOf('role="tablist"'));
  for (const label of ["Markiert", "Flagge Orange", "Ausgesetzt"]) assert.match(icons, new RegExp(`aria-label="${label}"`));
  assert.match(markup, /aria-label="Markierung entfernen"/);
  assert.match(markup, /aria-pressed="true"[^>]*><svg[^>]*>[\s\S]*?<\/svg>Aussetzen/);
  assert.match(markup, /aria-pressed="true" aria-label="Flagge Orange"/);
  assert.match(markup, /data-testid="card-plan-state">Ausgesetzt</);
});
test("the mark belongs to the content and is shown on every card of the selected content", () => {
  const graph = basicGraph("deck-bio", "Was ist ATP?", "Ein Energieträger.", { reverse: true });
  const [forward, reverse] = graph.cards;
  const withVariant = addCardVariant(reverse, { front: "Andere Frage", back: "Antwort", qualityStatus: "active" });
  const marked = { note: setNoteMarked(graph.note, true), cards: [forward, withVariant] };
  const unmarked = { note: graph.note, cards: marked.cards };
  const deck = deckOf("deck-bio", "Biologie", [marked]);
  for (const contentDeckId of [undefined, deck.id]) {
    const markup = renderScreen([deck], {
      expandedDeckIds: [deck.id],
      selectedDeckId: deck.id,
      selectedCardId: forward.id,
      contentDeckId,
      cardPages: { [deck.id]: cardPage(deck.id, [marked], { selected: selectedOf(marked, forward.id) }) },
    });
    assert.match(markup, /aria-label="1 aktive Variante">1<\/span>/);
    assert.match(markup, /width="16" height="16"[^>]*class="lucide lucide-minus[^>]*aria-label="Keine Variante"/);
    assert.equal([...markup.matchAll(/class="grid size-\[1\.125rem\] place-items-center"><svg[^>]*aria-label="Markiert"/g)].length, 2);
    assert.doesNotMatch(markup, /inline-block whitespace-nowrap rounded-round/);
    assert.match(markup, /aria-label="Markierung entfernen"/);
  }
  const unmarkedMarkup = renderScreen([deck], {
    expandedDeckIds: [deck.id],
    selectedDeckId: deck.id,
    selectedCardId: withVariant.id,
    cardPages: { [deck.id]: cardPage(deck.id, [unmarked], { selected: selectedOf(unmarked, withVariant.id) }) },
  });
  assert.doesNotMatch(unmarkedMarkup, /aria-label="Markiert"/);
  assert.match(unmarkedMarkup, /aria-label="Karte markieren"/);
});
test("the editor names the card's position and lists its siblings with deck and learning state", () => {
  const graph = basicGraph("deck-bio", "Was ist ATP?", "Ein Energieträger.", { reverse: true });
  const deck = deckOf("deck-bio", "Biologie", [graph]);
  const markup = renderScreen([deck], {
    selectedDeckId: deck.id,
    selectedCardId: graph.cards[1].id,
    cardPages: { [deck.id]: cardPage(deck.id, [graph], { selected: selectedOf(graph, graph.cards[1].id) }) },
  });

  assert.match(markup, />Frage und Antwort mit Rückrichtung · Rückwärts · 2 Karten aus diesem Inhalt</);
  const siblings = markup.slice(markup.indexOf('data-testid="card-siblings"'));
  assert.match(siblings, /<button[^>]*>.*?Vorwärts.*?Biologie · neu, ohne Lernstand/);
  assert.match(siblings, /aria-current="true">.*?Rückwärts/);

  const cloze = manualGraph("deck-bio", { kind: "cloze", front: "{{c1::ATP}} ist ein {{c2::Energieträger}} der {{c3::Zelle}}.", back: "" });
  const clozeDeck = deckOf("deck-bio", "Biologie", [cloze]);
  const clozeMarkup = renderScreen([clozeDeck], {
    selectedDeckId: clozeDeck.id,
    selectedCardId: cloze.cards[1].id,
    cardPages: { [clozeDeck.id]: cardPage(clozeDeck.id, [cloze], { selected: selectedOf(cloze, cloze.cards[1].id) }) },
  });
  assert.match(clozeMarkup, />Lückentext · Lücke 2 von 3</);
  assert.match(clozeMarkup, /<h2[^>]*>ATP ist ein Energieträger der Zelle\.<\/h2>/);
});
test("cards page shows safe deterministic fallbacks for unavailable URL targets", () => {
  const deck = deckOf("deck-bio", "Biologie", [basicGraph("deck-bio", "ATP", "Energie")]);
  const missingDeckMarkup = renderScreen([deck], { selectedDeckId: "missing-deck" });
  assert.match(missingDeckMarkup, /Stapel nicht gefunden/);
  assert.match(missingDeckMarkup, /Zu Lernen/);
  assert.match(missingDeckMarkup, /Alle Karten/);

  const missingCardMarkup = renderScreen([deck], { selectedDeckId: deck.id, selectedCardId: "missing-card" });
  assert.match(missingCardMarkup, /Karte nicht gefunden/);
  assert.match(missingCardMarkup, /Zur Kartenliste/);
  assert.doesNotMatch(missingCardMarkup, /aria-label="Feld Vorderseite"/);

  const failedPage = { ...cardPage(deck.id, []), loadError: "Die Karte konnte nicht geladen werden." };
  const failedMarkup = renderScreen([deck], { selectedDeckId: deck.id, selectedCardId: "missing-card", cardPages: { [deck.id]: failedPage }, onRequestCardPage: () => undefined });
  assert.match(failedMarkup, /Karte noch nicht geladen/);
  assert.match(failedMarkup, /Die Karte konnte nicht geladen werden\./);
  assert.match(failedMarkup, />Erneut laden</);
});

test("prev/next shows the loading bar until the page answers for the selected card", () => {
  const deck = deckOf("deck-bio", "Biologie", [basicGraph("deck-bio", "ATP", "Energie")]);
  const render = (requestedCardId: string) => renderScreen([deck], {
    selectedDeckId: deck.id,
    selectedCardId: "next-card",
    cardPages: { [deck.id]: { ...cardPage(deck.id, []), requestedCardId } },
    onRequestCardPage: () => undefined,
  });

  const loading = render("previous-card");
  assert.match(loading, /role="progressbar" aria-label="Karte wird geladen"/);
  assert.doesNotMatch(loading, /Karte nicht gefunden/);
  assert.match(render("next-card"), /Karte nicht gefunden/);
});

function renderEditorFor(graph: NoteGraph, cardEditorTab: DecksScreenProps["cardEditorTab"] = "content") {
  const deck = deckOf("deck-editor", "Editor", [graph]);
  return renderScreen([deck], {
    selectedDeckId: deck.id,
    selectedCardId: graph.cards[0].id,
    cardEditorTab,
    cardPages: { [deck.id]: cardPage(deck.id, [graph], { selected: selectedOf(graph) }) },
  });
}

test("detail editor renders one rich-text editor per content field plus choice options and tags", () => {
  const imageMarkup = renderEditorFor(manualGraph("deck-editor", { kind: "basic", front: '<p>Vorne</p><img src="front-image.png">', back: '<p>Hinten</p><img src="back-image.png">', additionalFields: [{ name: "Quelle", value: "Lehrbuch", role: "extra" }], tags: ["bio", "atp"] }));
  assert.match(imageMarkup, />Frage und Antwort</);
  assert.match(imageMarkup, /aria-label="Feld Vorderseite"/);
  assert.match(imageMarkup, /aria-label="Feld Rückseite"/);
  assert.match(imageMarkup, /aria-label="Feld Quelle"/);
  assert.doesNotMatch(imageMarkup, /Tags bearbeiten/, "Tags gehören nicht zum Entwurf");
  assert.match(imageMarkup, /data-testid="card-live-preview"/);
  assert.match(imageMarkup, /aria-label="Kartenseite in der Vorschau"/);
  assert.match(imageMarkup, /aria-label="Ansicht"[\s\S]*?Bearbeiten[\s\S]*?Vorschau/);
  assert.doesNotMatch(imageMarkup, /role="toolbar"/, "die Werkzeugleiste erscheint erst am aktiven Feld");
  assert.match(imageMarkup, /data-testid="card-draft-footer"[\s\S]*?Verwerfen[\s\S]*?Speichern/);
  assert.doesNotMatch(imageMarkup, /data-testid="field-changed"/);
  assert.doesNotMatch(imageMarkup, /Antwortoptionen/);

  const clozeMarkup = renderEditorFor(manualGraph("deck-editor", { kind: "cloze", front: "{{c1::ATP}} speichert Energie.", back: "Energie", tags: [] }));
  assert.match(clozeMarkup, />Lückentext</);
  assert.match(clozeMarkup, /aria-label="Feld Text"/);
  assert.match(clozeMarkup, /aria-label="Feld Zusatzinfo"/);
  assert.match(clozeMarkup, /Lücken mit <code>\{\{c1::Begriff\}\}<\/code> markieren/);

  const scMarkup = renderEditorFor(manualGraph("deck-editor", { kind: "single-choice", front: "Welche?", back: "Darum", answerOptions: ["A", "B"], correctOptionIndices: [1], tags: [] }));
  assert.match(scMarkup, />Single Choice</);
  assert.match(scMarkup, /aria-label="Feld Frage"/);
  assert.match(scMarkup, /Antwortoptionen und richtige Antwort</);
  assert.match(scMarkup, /type="radio"/);
  assert.match(scMarkup, /aria-label="Antwortoption 2"/);
  assert.match(scMarkup, />Option hinzufügen</);

  const mcMarkup = renderEditorFor(manualGraph("deck-editor", { kind: "multiple-choice", front: "Welche?", back: "Darum", answerOptions: ["A", "B", "C"], correctOptionIndices: [0, 1], tags: [] }));
  assert.match(mcMarkup, />Multiple Choice</);
  assert.match(mcMarkup, /Antwortoptionen und richtige Antworten/);
  assert.match(mcMarkup, /type="checkbox"/);
  assert.match(mcMarkup, /Option 2 als richtig markieren/);
});

test("sync conflicts are named in the row and in the editor", () => {
  const graph = basicGraph("deck-bio", "Konfliktkarte", "Antwort");
  const deck = deckOf("deck-bio", "Biologie", [graph]);
  const markup = renderScreen([deck], {
    expandedDeckIds: [deck.id],
    selectedDeckId: deck.id,
    selectedCardId: graph.cards[0].id,
    syncConflictCardIds: new Set([graph.cards[0].id]),
    cardPages: { [deck.id]: cardPage(deck.id, [graph], { selected: selectedOf(graph) }) },
  });
  assert.equal([...markup.matchAll(/Synchronisierung klären/g)].length, 2);
  assert.match(markup, /Konflikt öffnen/);
});
test("the editor offers direction and building blocks where the content structure allows them", () => {
  const basic = renderEditorFor(basicGraph("deck-editor", "Was ist ATP?", "Energieträger"));
  assert.match(basic, /data-testid="note-direction"[\s\S]*?aria-label="Lernrichtung"/);
  assert.match(basic, /data-testid="note-direction"[\s\S]*?aria-pressed="false"[^>]*>.*?Antwort eintippen/);
  const basicBlocks = basic.slice(basic.indexOf('data-testid="note-blocks"'));
  for (const label of ["Zusatzfrage", "Hinweis", "Zusatz", "Quelle"]) assert.match(basicBlocks, new RegExp(`${label}</button>`));

  const cloze = renderEditorFor(manualGraph("deck-editor", { kind: "cloze", front: "{{c1::ATP}} speichert Energie.", back: "" }));
  assert.doesNotMatch(cloze, /aria-label="Lernrichtung"|Antwort eintippen/);
  const clozeBlocks = cloze.slice(cloze.indexOf('data-testid="note-blocks"'));
  assert.doesNotMatch(clozeBlocks, /Antwort eintippen/);
  assert.match(clozeBlocks, /Hinweis<\/button>/);

  const importedGraph = basicGraph("deck-editor", "Was ist ATP?", "Energieträger");
  const imported = renderEditorFor({ ...importedGraph, note: { ...importedGraph.note, importedContentRevision: importedGraph.note.contentRevision } });
  assert.doesNotMatch(imported, /aria-label="Lernrichtung"|data-testid="note-blocks"| entfernen"/);
});

test("der Karteneditor bietet für hinzugefügte Felder Rolle und Reihenfolge wie die Erstellung", () => {
  const atp = basicGraph("deck-bio", "Was ist ATP?", "Ein Energieträger.");
  const withHint = addNoteField(atp.note.content, "hint").content;
  const graph = { ...atp, note: { ...atp.note, content: addNoteField(withHint, "extra").content } };
  const deck = deckOf("deck-bio", "Biologie", [graph]);
  const editor = renderScreen([deck], {
    selectedDeckId: deck.id,
    selectedCardId: graph.cards[0].id,
    cardEditorTab: "content",
    cardPages: { [deck.id]: cardPage(deck.id, [graph], { selected: selectedOf(graph) }) },
  });
  assert.match(editor, /aria-label="Rolle von Hinweis"/);
  assert.match(editor, /aria-label="Rolle von Zusatz"/);
  assert.match(editor, /aria-label="Hinweis nach unten"/);
  assert.match(editor, /aria-label="Zusatz nach oben"/);
  assert.doesNotMatch(editor, /aria-label="Hinweis nach oben"|aria-label="Zusatz nach unten"/, "Pfeile nur, wo ein Nachbar existiert");
});

test("rows show a named flag dot and the filters read their search terms", () => {
  const graph = basicGraph("deck-bio", "Was ist ATP?", "Ein Energieträger.");
  const flagged = { ...graph, cards: [{ ...graph.cards[0], ankiFlag: 5 }] };
  const deck = deckOf("deck-bio", "Biologie", [flagged]);
  const markup = renderScreen([deck], {
    expandedDeckIds: [deck.id],
    cardEditor: { ...CARD_EDITOR_SERVICES, flagNames: ["", "", "", "", "Prüfung", "", ""] },
    cardPages: { [deck.id]: cardPage(deck.id, [flagged]) },
  });
  assert.match(markup, /data-card-row="true"[\s\S]*?role="img" aria-label="Flagge Prüfung"/);
  assert.match(markup, /aria-label="Nach Flagge filtern"[\s\S]*?Alle Flaggen/);
  assert.match(markup, /aria-pressed="false"[^>]*><svg[^>]*>[\s\S]*?<\/svg>Lernbremse/);
  assert.match(markup, /Nach Tags filtern/);
});
