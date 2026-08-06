import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck } from "../coreModel.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { DeckTree } from "./DeckTree.tsx";

const decks = [
  createCoreDeck({ id: "root", name: "Bereich", hierarchyPath: ["Bereich"], source: "manual", cards: [] }),
  createCoreDeck({
    id: "child",
    parentDeckId: "root",
    name: "Grundlagen",
    hierarchyPath: ["Bereich", "Grundlagen"],
    source: "manual",
    cards: [],
  }),
];
const rows = createDeckLibraryModel(decks).rows;

test("deck tree keeps hierarchy, labels and all three semantic metrics in every row", () => {
  const markup = renderToStaticMarkup(
    <DeckTree rows={rows} mode="learn" onActivate={() => undefined} onOpenSettings={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(markup, /aria-label="Bereich lernen"/);
  assert.match(markup, /aria-label="Bereich \/ Grundlagen lernen"/);
  assert.match(markup, />Bereich \/ Grundlagen</);
  assert.equal((markup.match(/data-deck-count="new"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-deck-count="due"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-deck-count="total"/g) ?? []).length, 2);
  assert.match(markup, /var\(--core-deck-new-text\)/);
  assert.match(markup, /var\(--core-deck-due-text\)/);
  assert.match(markup, /var\(--core-deck-total-text\)/);
  assert.match(markup, /data-deck-drag-source="true"/);
  assert.match(markup, /data-deck-depth="0"[^>]*class="core-deck-summary-row/);
  assert.match(markup, /data-deck-depth="1"[^>]*class="core-deck-summary-row/);
  assert.match(markup, /select-none/);
  assert.match(markup, /min-w-\[46rem\]/);
  assert.ok(markup.indexOf("Unterstapel von Bereich ausblenden") < markup.indexOf('data-deck-icon="true"'));
  assert.match(markup, /<button[^>]*data-deck-drag-source="true"[^>]*data-deck-row-activation="true"/);
  assert.match(markup, /lucide-ellipsis/);
  assert.match(markup, /data-core-tooltip="Stapeloptionen für Bereich"/);
});

test("deck tree maps four visible levels to group depths and clamps deeper imports", () => {
  const deepDecks = [
    createCoreDeck({ id: "depth-root", name: "Ebene 1", hierarchyPath: ["Ebene 1"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-child", parentDeckId: "depth-root", name: "Ebene 2", hierarchyPath: ["Ebene 1", "Ebene 2"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-grandchild", parentDeckId: "depth-child", name: "Ebene 3", hierarchyPath: ["Ebene 1", "Ebene 2", "Ebene 3"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-great-grandchild", parentDeckId: "depth-grandchild", name: "Ebene 4", hierarchyPath: ["Ebene 1", "Ebene 2", "Ebene 3", "Ebene 4"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-import", parentDeckId: "depth-great-grandchild", name: "Importtiefe", hierarchyPath: ["Ebene 1", "Ebene 2", "Ebene 3", "Ebene 4", "Importtiefe"], source: "anki-apkg", cards: [] }),
  ];
  const markup = renderToStaticMarkup(
    <DeckTree rows={createDeckLibraryModel(deepDecks).rows} mode="learn" onActivate={() => undefined} onOpenSettings={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(markup, /data-testid="learn-deck-row-depth-root"[^>]*data-deck-depth="0"/);
  assert.match(markup, /data-testid="learn-deck-row-depth-child"[^>]*data-deck-depth="1"/);
  assert.match(markup, /data-testid="learn-deck-row-depth-grandchild"[^>]*data-deck-depth="2"/);
  assert.match(markup, /data-testid="learn-deck-row-depth-great-grandchild"[^>]*data-deck-depth="3"/);
  assert.match(markup, /data-testid="learn-deck-row-depth-import"[^>]*data-deck-depth="3"/);
});

test("deck tree keeps the compact summary order across dashboard and learning", () => {
  const dashboard = renderToStaticMarkup(
    <DeckTree rows={rows} mode="dashboard" onActivate={() => undefined} onOpenSettings={() => undefined} onMoveDeck={() => null} />,
  );
  const learning = renderToStaticMarkup(
    <DeckTree rows={rows} mode="learn" onActivate={() => undefined} onOpenSettings={() => undefined} onMoveDeck={() => null} />,
  );

  for (const markup of [dashboard, learning]) {
    assert.match(markup, /conic-gradient/);
    assert.match(markup, /Stapeloptionen für Bereich/);
    assert.ok(markup.indexOf("conic-gradient") < markup.indexOf("Stapeloptionen für Bereich"));
    assert.match(markup, /data-deck-drag-source="true"/);
  }
  assert.match(learning, /aria-label="Bereich \/ Grundlagen lernen"/);
  assert.doesNotMatch(learning, /aria-pressed=|data-selected=/);
});
