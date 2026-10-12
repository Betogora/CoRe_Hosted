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

test("folder view opens the focused branch while retaining content, study, options and drag actions", () => {
  const markup = renderToStaticMarkup(<DeckTree rows={rows} mode="learn" viewMode="folders" focusedDeckId="root" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />);
  assert.match(markup, /data-testid="learn-deck-folders"/);
  assert.match(markup, /data-testid="learn-deck-row-root"/);
  assert.ok(markup.indexOf('data-testid="learn-deck-row-root"') < markup.indexOf('data-testid="deck-folder-contents"'));
  assert.match(markup, /data-selected="true"/);
  assert.match(markup, /aria-label="Unterstapelübersicht schließen"/);
  assert.match(markup, /aria-label="Stapelpfad"/);
  assert.match(markup, /aria-current="page">Bereich/);
  assert.match(markup, /core-deck-subfolder-card/);
  assert.doesNotMatch(markup, /data-donut-/);
  assert.match(markup, /data-testid="deck-folder-contents"/);
  assert.match(markup, /data-testid="learn-deck-row-child"/);
  assert.match(markup, /aria-label="Bereich \/ Grundlagen lernen"/);
  assert.match(markup, /aria-label="Stapeloptionen für Bereich \/ Grundlagen"/);
  assert.match(markup, />Alle Karten dieses Zweigs<\/span>/);
  assert.match(markup, />Diesen Zweig lernen<\/span>/);
  assert.match(markup, /data-deck-drag-source="true"/);
  assert.equal((markup.match(/data-deck-count="new"/g) ?? []).length, 2);
});

test("folder navigation keeps the root collection above the current branch and shows every ancestor", () => {
  const grandchild = createCoreDeck({ id: "grandchild", parentDeckId: "child", name: "Vertiefung", hierarchyPath: ["Bereich", "Grundlagen", "Vertiefung"], source: "manual", cards: [] });
  const markup = renderToStaticMarkup(<DeckTree rows={createDeckLibraryModel([...decks, grandchild]).rows} mode="learn" viewMode="folders" focusedDeckId="child" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />);
  const navigation = markup.slice(markup.indexOf('aria-label="Stapelpfad"'), markup.indexOf('</nav>'));
  assert.match(navigation, />Alle Stapel<\/button>/);
  assert.match(navigation, />Bereich<\/button>/);
  assert.match(navigation, /aria-current="page">Grundlagen/);
  assert.equal((markup.match(/data-testid="learn-deck-row-root"/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /data-testid="learn-deck-row-child"/);
  assert.match(markup, /aria-label="Inhalte von Bereich \/ Grundlagen \/ Vertiefung öffnen"/);
  assert.match(markup, /aria-label="Bereich \/ Grundlagen \/ Vertiefung lernen"/);
  assert.match(markup, /aria-label="Bereich \/ Grundlagen als Zweig lernen"/);
  assert.doesNotMatch(markup, /data-donut-/);
});

test("deck tree keeps one visual header and all three accessibly labelled metrics in every row", () => {
  const markup = renderToStaticMarkup(
    <DeckTree rows={rows} mode="learn" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(markup, /aria-label="Bereich lernen"/);
  assert.match(markup, /aria-label="Inhalte von Bereich öffnen"/);
  assert.match(markup, /lucide-play/);
  assert.match(markup, /aria-label="Bereich \/ Grundlagen lernen"/);
  assert.doesNotMatch(markup, />Bereich \/ Grundlagen</);
  assert.equal((markup.match(/data-deck-count="new"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-deck-count="in-progress"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-deck-count="due"/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /data-deck-count="total"|>Gesamt</);
  assert.equal((markup.match(/data-testid="deck-summary-header"/g) ?? []).length, 1);
  assert.match(markup, /data-testid="deck-summary-header"[^>]*aria-hidden="true"[\s\S]*>Stapel<[\s\S]*>Neu<[\s\S]*>Offen<[\s\S]*>Fällig</);
  assert.equal((markup.match(/data-deck-summary-row-content="responsive"/g) ?? []).length, 2);
  assert.equal((markup.match(/core-deck-summary-container/g) ?? []).length, 3);
  assert.equal((markup.match(/data-testid="deck-options-/g) ?? []).length, 2);
  assert.match(markup, /data-deck-count="new"><dt class="sr-only">Neu<\/dt>/);
  assert.match(markup, /data-deck-count="in-progress"><dt class="sr-only">Offen<\/dt>/);
  assert.match(markup, /data-deck-count="due"><dt class="sr-only">Fällig<\/dt>/);
  assert.doesNotMatch(markup, /core-deck-summary-count-label/);
  assert.doesNotMatch(markup, /hidden md:block/);
  assert.doesNotMatch(markup, /md:not-sr-only|md:size-10|md:text-base/);
  assert.match(markup, /var\(--core-learning-status-new\)/);
  assert.match(markup, /var\(--core-learning-status-in-progress\)/);
  assert.match(markup, /var\(--core-learning-status-due\)/);
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
  assert.match(markup, /<button[^>]*class="[^"]*-me-2[^"]*"[^>]*aria-label="Unterstapel von Bereich ausblenden"/);
  assert.match(markup, /<span class="size-11 shrink-0" aria-hidden="true"><\/span>/);
  assert.match(markup, /<button[^>]*data-deck-drag-source="true"[^>]*data-deck-row-activation="true"/);
  assert.match(markup, /lucide-ellipsis/);
  assert.match(markup, /data-core-tooltip="Stapeloptionen für Bereich"/);
  assert.match(markup, /<button(?=[^>]*aria-label="Stapeloptionen für Bereich \/ Grundlagen")(?=[^>]*data-core-tooltip="Stapeloptionen für Grundlagen")(?=[^>]*data-core-tooltip-deck-icon-key="[^"]+")(?=[^>]*data-core-tooltip-deck-icon-color="#[0-9A-Fa-f]{6}")/);
  assert.doesNotMatch(markup, /data-core-tooltip="Stapeloptionen für Bereich \/ Grundlagen"/);
});

test("deck tree places its create form after the grouped list and omits an empty row frame", () => {
  const content = <form data-testid="panel-content"><input aria-label="Stapelname" /></form>;
  const populated = renderToStaticMarkup(
    <DeckTree rows={rows} mode="learn" contentBeforeRows={content} collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );
  const empty = renderToStaticMarkup(
    <DeckTree rows={[]} mode="learn" contentBeforeRows={content} collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.ok(populated.indexOf("Aktive Stapel") < populated.indexOf('data-testid="panel-content"'));
  assert.ok(populated.indexOf('data-testid="deck-summary-header"') < populated.indexOf('data-testid="panel-content"'));
  assert.match(empty, /data-testid="panel-content"/);
  assert.doesNotMatch(empty, /core-deck-tree-rows|data-testid="deck-summary-header"/);
});

test("deck groups retain each complete visible branch and root metadata after collapsing", () => {
  const grandchild = createCoreDeck({ id: "grandchild", parentDeckId: "child", name: "Vertiefung", hierarchyPath: ["Bereich", "Grundlagen", "Vertiefung"], source: "manual", cards: [] });
  const secondRoot = createCoreDeck({ id: "second-root", name: "Zweiter Bereich", hierarchyPath: ["Zweiter Bereich"], source: "manual", cards: [] });
  const branchRows = createDeckLibraryModel([...decks, grandchild, secondRoot]).rows;
  for (const mode of ["dashboard", "learn"] as const) {
    const render = (collapsedDeckIds: string[]) => renderToStaticMarkup(<DeckTree rows={branchRows} mode={mode} collapsedDeckIds={collapsedDeckIds} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />);
    const expanded = render([]);
    const firstGroup = expanded.slice(expanded.indexOf('data-deck-group="root"'), expanded.indexOf('</section>'));
    assert.match(firstGroup, new RegExp(`${mode}-deck-row-root`));
    assert.match(firstGroup, new RegExp(`${mode}-deck-row-child`));
    assert.match(firstGroup, new RegExp(`${mode}-deck-row-grandchild`));
    assert.doesNotMatch(firstGroup, /deck-row-second-root/);
    assert.match(firstGroup, /0 Karten · 2 Unterstapel/);
    assert.equal((expanded.match(/data-deck-group=/g) ?? []).length, 2);
    const collapsed = render(["root"]);
    assert.match(collapsed, /0 Karten · 2 Unterstapel/);
    assert.match(collapsed, new RegExp(`${mode}-deck-row-second-root`));
    assert.doesNotMatch(collapsed, /deck-row-child|deck-row-grandchild/);
    assert.equal((collapsed.match(/data-deck-group=/g) ?? []).length, 2);
  }
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
    assert.doesNotMatch(markup, /data-donut-|Gesamtfortschritt für/);
    assert.match(markup, /Stapeloptionen für Bereich/);
    assert.ok(markup.indexOf('data-deck-count="due"') < markup.indexOf('aria-label="Bereich lernen"'));
    assert.ok(markup.indexOf('aria-label="Bereich lernen"') < markup.indexOf("Stapeloptionen für Bereich"));
    assert.match(markup, /data-deck-drag-source="true"/);
  }
  assert.match(learning, /aria-label="Bereich \/ Grundlagen lernen"/);
  assert.doesNotMatch(learning, /aria-pressed=|data-selected=/);
});

test("deck tree projects a persisted collapsed parent", () => {
  const markup = renderToStaticMarkup(
    <DeckTree rows={rows} mode="dashboard" collapsedDeckIds={["root"]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.match(markup, /Unterstapel von Bereich anzeigen/);
  assert.doesNotMatch(markup, /dashboard-deck-row-child/);
});

test("deck tree fills hovered rows without separating deck headers", () => {
  const boundaryDecks = [
    ...decks,
    createCoreDeck({ id: "second-root", name: "Zweiter Bereich", hierarchyPath: ["Zweiter Bereich"], source: "manual", cards: [] }),
  ];
  const markup = renderToStaticMarkup(
    <DeckTree rows={createDeckLibraryModel(boundaryDecks).rows} mode="learn" collapsedDeckIds={[]} onDeckExpansionChange={() => undefined} onActivate={() => undefined} onStudy={() => undefined} onOpenSettings={() => undefined} onSetDeckCoreMode={() => undefined} onMoveDeck={() => null} />,
  );

  assert.doesNotMatch(markup, /class="core-deck-summary-row[^"]*border-b/);
  assert.doesNotMatch(markup, /data-testid="learn-deck-row-[^"]+"[^>]*class="[^"]*border-t-2/);
  assert.match(markup, /data-deck-row-activation="true"[^>]*class="[^"]*hover:bg-\[var\(--core-focus-ring-soft\)\]/);
});
