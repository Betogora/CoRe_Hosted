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

test("deck tree keeps one visual header and all three accessibly labelled metrics in every row", () => {
  const markup = renderToStaticMarkup(
    <DeckTree rows={rows} mode="learn" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(markup, /aria-label="Bereich lernen"/);
  assert.match(markup, /aria-label="Bereich \/ Grundlagen lernen"/);
  assert.doesNotMatch(markup, />Bereich \/ Grundlagen</);
  assert.equal((markup.match(/data-deck-count="new"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-deck-count="in-progress"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-deck-count="due"/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /data-deck-count="total"|>Gesamt</);
  assert.equal((markup.match(/data-testid="deck-summary-header"/g) ?? []).length, 1);
  assert.match(markup, /data-testid="deck-summary-header"[^>]*aria-hidden="true"[\s\S]*>Stapel<[\s\S]*>Neu<[\s\S]*>In Arbeit<[\s\S]*>Fällig</);
  assert.equal((markup.match(/data-deck-summary-row-content="responsive"/g) ?? []).length, 2);
  assert.equal((markup.match(/core-deck-summary-container/g) ?? []).length, 3);
  assert.equal((markup.match(/data-testid="deck-options-/g) ?? []).length, 2);
  assert.match(markup, /data-deck-count="new"><dt class="sr-only">Neu<\/dt>/);
  assert.match(markup, /data-deck-count="in-progress"><dt class="sr-only">In Arbeit<\/dt>/);
  assert.match(markup, /data-deck-count="due"><dt class="sr-only">Fällig<\/dt>/);
  assert.doesNotMatch(markup, /core-deck-summary-count-label/);
  assert.doesNotMatch(markup, /hidden md:block/);
  assert.match(markup, /core-donut-responsive/);
  assert.doesNotMatch(markup, /md:not-sr-only|md:size-10|md:text-base/);
  assert.match(markup, /var\(--core-learning-status-new\)/);
  assert.match(markup, /var\(--core-learning-status-in-progress\)/);
  assert.match(markup, /var\(--core-learning-status-due\)/);
  assert.equal((markup.match(/data-donut-empty="true"/g) ?? []).length, 2);
  assert.match(markup, /data-deck-drag-source="true"/);
  assert.match(markup, /data-deck-depth="0"[^>]*class="core-deck-summary-row/);
  assert.match(markup, /data-deck-depth="1"[^>]*class="core-deck-summary-row/);
  assert.match(markup, /select-none/);
  assert.match(markup, /grid-cols-\[minmax\(0,1fr\)_auto_auto\]/);
  assert.doesNotMatch(markup, /min-w-\[46rem\]|overflow-x-auto/);
  assert.match(markup, /core-deck-tree-rows min-w-0/);
  assert.match(markup, /core-deck-tree-container/);
  assert.match(markup, /core-deck-tree-header/);
  assert.doesNotMatch(markup, /pointer-events-auto flex items-center justify-end/);
  assert.ok(markup.indexOf("Unterstapel von Bereich ausblenden") < markup.indexOf('data-deck-icon="true"'));
  assert.match(markup, /<button[^>]*data-deck-drag-source="true"[^>]*data-deck-row-activation="true"/);
  assert.match(markup, /lucide-ellipsis/);
  assert.match(markup, /data-core-tooltip="Stapeloptionen für Bereich"/);
  assert.match(markup, /<button(?=[^>]*aria-label="Stapeloptionen für Bereich \/ Grundlagen")(?=[^>]*data-core-tooltip="Stapeloptionen für Grundlagen")(?=[^>]*data-core-tooltip-deck-icon-key="[^"]+")(?=[^>]*data-core-tooltip-deck-icon-color="#[0-9A-Fa-f]{6}")/);
  assert.doesNotMatch(markup, /data-core-tooltip="Stapeloptionen für Bereich \/ Grundlagen"/);
});

test("deck tree maps five visible levels to group depths and clamps deeper imports", () => {
  const deepDecks = [
    createCoreDeck({ id: "depth-root", name: "Ebene 1", hierarchyPath: ["Ebene 1"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-child", parentDeckId: "depth-root", name: "Ebene 2", hierarchyPath: ["Ebene 1", "Ebene 2"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-grandchild", parentDeckId: "depth-child", name: "Ebene 3", hierarchyPath: ["Ebene 1", "Ebene 2", "Ebene 3"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-great-grandchild", parentDeckId: "depth-grandchild", name: "Ebene 4", hierarchyPath: ["Ebene 1", "Ebene 2", "Ebene 3", "Ebene 4"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-import", parentDeckId: "depth-great-grandchild", name: "Importtiefe", hierarchyPath: ["Ebene 1", "Ebene 2", "Ebene 3", "Ebene 4", "Importtiefe"], source: "anki-apkg", cards: [] }),
    createCoreDeck({ id: "depth-deeper-import", parentDeckId: "depth-import", name: "Tiefere Importebene", hierarchyPath: ["Ebene 1", "Ebene 2", "Ebene 3", "Ebene 4", "Importtiefe", "Tiefere Importebene"], source: "anki-apkg", cards: [] }),
  ];
  const markup = renderToStaticMarkup(
    <DeckTree rows={createDeckLibraryModel(deepDecks).rows} mode="learn" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(markup, /data-testid="learn-deck-row-depth-root"[^>]*data-deck-depth="0"/);
  assert.match(markup, /data-testid="learn-deck-row-depth-child"[^>]*data-deck-depth="1"/);
  assert.match(markup, /data-testid="learn-deck-row-depth-grandchild"[^>]*data-deck-depth="2"/);
  assert.match(markup, /data-testid="learn-deck-row-depth-great-grandchild"[^>]*data-deck-depth="3"/);
  assert.match(markup, /data-testid="learn-deck-row-depth-import"[^>]*data-deck-depth="4"/);
  assert.match(markup, /data-testid="learn-deck-row-depth-deeper-import"[^>]*data-deck-depth="4"/);
});

test("deck tree keeps the compact summary order across dashboard and learning", () => {
  const dashboard = renderToStaticMarkup(
    <DeckTree rows={rows} mode="dashboard" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );
  const learning = renderToStaticMarkup(
    <DeckTree rows={rows} mode="learn" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  for (const markup of [dashboard, learning]) {
    assert.match(markup, /data-donut-empty="true"/);
    assert.match(markup, /Stapeloptionen für Bereich/);
    assert.ok(markup.indexOf('data-donut-empty="true"') < markup.indexOf("Stapeloptionen für Bereich"));
    assert.match(markup, /data-deck-drag-source="true"/);
  }
  assert.match(learning, /aria-label="Bereich \/ Grundlagen lernen"/);
  assert.doesNotMatch(learning, /aria-pressed=|data-selected=/);
});

test("deck tree projects a persisted collapsed parent", () => {
  const markup = renderToStaticMarkup(
    <DeckTree rows={rows} mode="dashboard" collapsedDeckIds={["root"]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(markup, /Unterstapel von Bereich anzeigen/);
  assert.doesNotMatch(markup, /dashboard-deck-row-child/);
});
