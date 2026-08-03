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
  assert.match(markup, /data-deck-depth="0"[^>]*class="core-deck-group/);
  assert.match(markup, /data-deck-depth="1"[^>]*class="core-deck-group/);
});

test("deck tree exposes only mode-specific row utilities", () => {
  const dashboard = renderToStaticMarkup(
    <DeckTree rows={rows} mode="dashboard" onActivate={() => undefined} onMoveDeck={() => null} />,
  );
  const management = renderToStaticMarkup(
    <DeckTree rows={rows} mode="manage" selectedDeckId="child" onActivate={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(dashboard, /conic-gradient/);
  assert.doesNotMatch(dashboard, /Stapeloptionen/);
  assert.match(management, /aria-label="Bereich \/ Grundlagen öffnen"/);
  assert.match(management, /aria-pressed="true"/);
  assert.match(management, /data-selected="true"/);
  assert.match(management, /draggable="true"/);
  assert.doesNotMatch(management, /conic-gradient|Stapeloptionen/);
});
