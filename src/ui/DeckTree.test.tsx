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
    <DeckTree rows={rows} mode="learn" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(markup, /aria-label="Bereich lernen"/);
  assert.match(markup, /aria-label="Inhalte von Bereich öffnen"/);
  assert.match(markup, /lucide-play/);
  assert.doesNotMatch(markup, /data-donut-|Gesamtfortschritt/);
  assert.match(markup, /aria-label="Bereich \/ Grundlagen lernen"/);
  assert.doesNotMatch(markup, />Bereich \/ Grundlagen</);
  assert.equal((markup.match(/data-deck-count="new"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-deck-count="in-progress"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-deck-count="due"/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /data-deck-count="total"|>Gesamt</);
  assert.equal((markup.match(/data-testid="deck-summary-header"/g) ?? []).length, 1);
  assert.match(markup, /data-testid="deck-summary-header"[^>]*aria-hidden="true"[\s\S]*>Stapel<[\s\S]*>Neu<[\s\S]*>Offen<[\s\S]*>Fällig</);
  assert.equal((markup.match(/data-deck-summary-row-content="responsive"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-testid="deck-options-/g) ?? []).length, 2);
  assert.equal((markup.match(/data-deck-count="new"><dt class="sr-only">Neu<\/dt>/g) ?? []).length, 2);
  assert.equal((markup.match(/data-deck-count="in-progress"><dt class="sr-only">Offen<\/dt>/g) ?? []).length, 2);
  assert.equal((markup.match(/data-deck-count="due"><dt class="sr-only">Fällig<\/dt>/g) ?? []).length, 2);
  assert.match(markup, /var\(--core-learning-status-new\)/);
  assert.match(markup, /var\(--core-learning-status-in-progress\)/);
  assert.match(markup, /var\(--core-learning-status-due\)/);
  assert.match(markup, /data-testid="learn-deck-list"/);
  assert.match(markup, /data-testid="learn-deck-list-header"/);
  assert.ok(markup.indexOf("Unterstapel von Bereich ausblenden") < markup.indexOf('data-deck-icon="true"'));
  assert.match(markup, /<button[^>]*aria-label="Unterstapel von Bereich ausblenden" aria-expanded="true"/);
  assert.doesNotMatch(markup, /Unterstapel von Bereich \/ Grundlagen/);
  assert.equal((markup.match(/<button[^>]*data-deck-drag-source="true"[^>]*data-deck-row-activation="true"/g) ?? []).length, 2);
  assert.match(markup, /lucide-ellipsis/);
  assert.match(markup, /data-core-tooltip="Stapeloptionen für Bereich"/);
  assert.match(markup, /<button(?=[^>]*aria-label="Stapeloptionen für Bereich \/ Grundlagen")(?=[^>]*data-core-tooltip="Stapeloptionen für Grundlagen")(?=[^>]*data-core-tooltip-deck-icon-key="[^"]+")(?=[^>]*data-core-tooltip-deck-icon-color="#[0-9A-Fa-f]{6}")/);
  assert.doesNotMatch(markup, /data-core-tooltip="Stapeloptionen für Bereich \/ Grundlagen"/);
});

test("deck tree places caller content below the collection and omits an empty row frame", () => {
  const content = <form data-testid="panel-content"><input aria-label="Stapelname" /></form>;
  const populated = renderToStaticMarkup(
    <DeckTree rows={rows} mode="learn" contentAfterRows={content} collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );
  const empty = renderToStaticMarkup(
    <DeckTree rows={[]} mode="learn" contentAfterRows={content} collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.ok(populated.indexOf('data-testid="deck-summary-header"') < populated.indexOf('data-testid="panel-content"'));
  assert.ok(populated.indexOf('data-testid="learn-deck-row-child"') < populated.indexOf('data-testid="panel-content"'));
  assert.match(empty, /data-testid="panel-content"/);
  assert.doesNotMatch(empty, /data-testid="deck-summary-header"|data-deck-group=/);
});

test("deck tree maps six visible levels to group depths and clamps anything deeper", () => {
  const deepDecks = Array.from({ length: 12 }, (_, index) => createCoreDeck({
    id: `depth-${index + 1}`,
    parentDeckId: index === 0 ? null : `depth-${index}`,
    name: `Ebene ${index + 1}`,
    hierarchyPath: Array.from({ length: index + 1 }, (__, pathIndex) => `Ebene ${pathIndex + 1}`),
    source: "anki-apkg",
    cards: [],
  }));
  const markup = renderToStaticMarkup(
    <DeckTree rows={createDeckLibraryModel(deepDecks).rows} mode="learn" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  for (let depth = 0; depth <= 5; depth += 1) {
    assert.match(markup, new RegExp(`data-testid="learn-deck-row-depth-${depth + 1}"[^>]*data-deck-depth="${depth}"`));
  }
  for (let level = 7; level <= 12; level += 1) {
    assert.match(markup, new RegExp(`data-testid="learn-deck-row-depth-${level}"[^>]*data-deck-depth="5"`));
  }
  for (let level = 1; level < 12; level += 1) {
    assert.match(markup, new RegExp(`aria-label="Unterstapel von [^"]*Ebene ${level} ausblenden"`));
  }

  const collapsed = renderToStaticMarkup(
    <DeckTree rows={createDeckLibraryModel(deepDecks).rows} mode="learn" collapsedDeckIds={["depth-8"]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );
  assert.match(collapsed, /data-testid="learn-deck-row-depth-8"/);
  assert.doesNotMatch(collapsed, /data-testid="learn-deck-row-depth-9"|data-testid="learn-deck-row-depth-12"/);
});

test("deck tree keeps the compact summary order across dashboard and learning", () => {
  const dashboard = renderToStaticMarkup(
    <DeckTree rows={rows} mode="dashboard" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );
  const learning = renderToStaticMarkup(
    <DeckTree rows={rows} mode="learn" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  for (const markup of [dashboard, learning]) {
    assert.match(markup, /Stapeloptionen für Bereich/);
    assert.ok(markup.indexOf('data-deck-count="due"') < markup.indexOf('aria-label="Bereich lernen"'));
    assert.ok(markup.indexOf('aria-label="Bereich lernen"') < markup.indexOf("Stapeloptionen für Bereich"));
    assert.match(markup, /data-deck-drag-source="true"/);
  }
  assert.match(learning, /aria-label="Bereich \/ Grundlagen lernen"/);
  assert.doesNotMatch(learning, /aria-pressed=|data-selected=/);
  assert.match(learning, />Alle einklappen</);
  assert.doesNotMatch(dashboard, /Alle einklappen|Alle aufklappen/);
});

test("deck tree groups every main deck with its subdecks in one tinted group", () => {
  const groupedDecks = [
    ...decks,
    createCoreDeck({ id: "second-root", name: "Zweiter Bereich", hierarchyPath: ["Zweiter Bereich"], source: "manual", cards: [] }),
  ];
  const markup = renderToStaticMarkup(
    <DeckTree rows={createDeckLibraryModel(groupedDecks).rows} mode="learn" collapsedDeckIds={["root"]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.equal((markup.match(/aria-label="Stapelgruppe [^"]+" data-deck-group=/g) ?? []).length, 2);
  assert.match(markup, /aria-label="Stapelgruppe Bereich"[^>]*data-deck-group="root"[^>]*style="--core-deck-group-accent:#[0-9A-Fa-f]{6}"/);
  assert.match(markup, />Alle aufklappen</);
  assert.doesNotMatch(markup, /Hauptstapel<|Unterstapel<\/span>/);
});

test("deck tree tiles show main decks as tiles with content, study and options actions", () => {
  const markup = renderToStaticMarkup(
    <DeckTree rows={rows} mode="learn" view="tiles" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(markup, /data-deck-view="tiles"/);
  assert.match(markup, /data-testid="learn-deck-tiles"/);
  assert.ok(markup.indexOf('data-testid="learn-deck-tiles"') < markup.indexOf('data-testid="learn-deck-row-root"'));
  assert.match(markup, /aria-label="Unterstapel von Bereich öffnen"/);
  assert.match(markup, /aria-label="Inhalte von Bereich öffnen"[^>]*>.*Inhalte</);
  assert.match(markup, /aria-label="Bereich lernen"/);
  assert.match(markup, /Stapeloptionen für Bereich/);
  for (const label of ["Neu", "Offen", "Fällig"]) assert.match(markup, new RegExp(`<dt class="(?![^"]*sr-only)[^"]*">${label}</dt>`));
  assert.doesNotMatch(markup, /learn-deck-row-child|deck-summary-header|Alle einklappen|learn-deck-folder-panel/);
});

test("deck tree projects a persisted collapsed parent", () => {
  const markup = renderToStaticMarkup(
    <DeckTree rows={rows} mode="dashboard" collapsedDeckIds={["root"]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(markup, /Unterstapel von Bereich anzeigen/);
  assert.doesNotMatch(markup, /dashboard-deck-row-child/);
});

test("deck tree fills every hovered row neutrally across its activation surface", () => {
  const markup = renderToStaticMarkup(
    <DeckTree rows={rows} mode="learn" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.equal((markup.match(/data-deck-row-activation="true"[^>]*class="[^"]*hover:bg-core-subtle/g) ?? []).length, 2);
});
