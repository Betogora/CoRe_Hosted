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
  assert.match(markup, /draggable="true"/);
  assert.match(markup, /data-deck-depth="1"[^>]*class="core-deck-group/);
  assert.match(markup, /data-deck-depth="2"[^>]*class="core-deck-group/);
  assert.match(markup, /sm:gap-x-6/);
  assert.doesNotMatch(markup, /<span class="size-11 shrink-0"/);
  assert.ok(markup.indexOf('data-deck-icon="true"') < markup.indexOf("Unterstapel von Bereich ausblenden"));
  assert.match(markup, /data-deck-row-activation="true"[^>]*data-deck-drag-source="true"[^>]*draggable="true"/);
});

test("deck tree maps three visible levels to group depths and clamps deeper imports", () => {
  const deepDecks = [
    createCoreDeck({ id: "depth-root", name: "Ebene 1", hierarchyPath: ["Ebene 1"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-child", parentDeckId: "depth-root", name: "Ebene 2", hierarchyPath: ["Ebene 1", "Ebene 2"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-grandchild", parentDeckId: "depth-child", name: "Ebene 3", hierarchyPath: ["Ebene 1", "Ebene 2", "Ebene 3"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-import", parentDeckId: "depth-grandchild", name: "Importtiefe", hierarchyPath: ["Ebene 1", "Ebene 2", "Ebene 3", "Importtiefe"], source: "anki-apkg", cards: [] }),
  ];
  const markup = renderToStaticMarkup(
    <DeckTree rows={createDeckLibraryModel(deepDecks).rows} mode="manage" onActivate={() => undefined} onOpenSettings={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(markup, /data-testid="deck-group-depth-root"[^>]*data-deck-depth="1"/);
  assert.match(markup, /data-testid="deck-group-depth-child"[^>]*data-deck-depth="2"/);
  assert.match(markup, /data-testid="deck-group-depth-grandchild"[^>]*data-deck-depth="3"/);
  assert.match(markup, /data-testid="deck-group-depth-import"[^>]*data-deck-depth="3"/);
});

test("deck tree keeps donut and settings in the same order across all modes", () => {
  const dashboard = renderToStaticMarkup(
    <DeckTree rows={rows} mode="dashboard" onActivate={() => undefined} onOpenSettings={() => undefined} onMoveDeck={() => null} />,
  );
  const management = renderToStaticMarkup(
    <DeckTree rows={rows} mode="manage" selectedDeckId="child" onActivate={() => undefined} onOpenSettings={() => undefined} onMoveDeck={() => null} />,
  );

  for (const markup of [dashboard, management]) {
    assert.match(markup, /conic-gradient/);
    assert.match(markup, /Stapeloptionen für Bereich/);
    assert.ok(markup.indexOf("conic-gradient") < markup.indexOf("Stapeloptionen für Bereich"));
  }
  assert.match(management, /aria-label="Bereich \/ Grundlagen öffnen"/);
  assert.match(management, /aria-pressed="true"/);
  assert.match(management, /data-selected="true"/);
  assert.match(management, /draggable="true"/);
});
