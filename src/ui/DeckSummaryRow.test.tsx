import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck } from "../coreModel.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { DeckSummaryRow } from "./DeckSummaryRow.tsx";

const parent = createCoreDeck({ id: "parent", name: "Herkunft", hierarchyPath: ["Herkunft"], source: "manual", cards: [] });
const child = createCoreDeck({ id: "child", parentDeckId: parent.id, name: "Ein sehr langer Unterstapelname", hierarchyPath: ["Herkunft", "Ein sehr langer Unterstapelname"], source: "manual", cards: [] });
const row = createDeckLibraryModel([parent, child]).rows[1];

test("deck summary row keeps responsive identity and accessible metrics without a progress ring", () => {
  const markup = renderToStaticMarkup(
    <DeckSummaryRow
      row={row}
      learningStatus={{ summary: row.summary }}
      leadingControl={<button type="button" aria-label="Unterstapel einklappen" />}
      actions={<button type="button" aria-label="Stapeloptionen" />}
      density="compact"
    />,
  );

  assert.match(markup, /data-deck-summary-row-content="compact"/);
  assert.match(markup, /data-deck-name-wrap="false">Ein sehr langer Unterstapelname<\/span>/);
  assert.match(markup, /aria-hidden="true">Ein sehr langer Unterstapelname<\/span>/);
  assert.doesNotMatch(markup, />Herkunft \/ Ein sehr langer Unterstapelname</);
  for (const metric of ["new", "in-progress", "due"]) assert.match(markup, new RegExp(`data-deck-count="${metric}"`));
  for (const label of ["Neu", "Offen", "Fällig"]) assert.match(markup, new RegExp(`<dt class="sr-only">${label}</dt>`));
  assert.doesNotMatch(markup, /data-deck-count="total"|>Gesamt</);
  assert.match(markup, /data-deck-icon="true"/);
  assert.match(markup, /padding-inline-start:calc\(1 \* var\(--core-deck-depth-indent, 8px\)\)/);
  assert.doesNotMatch(markup, /data-donut-|Gesamtfortschritt|Keine aktiven Karten/);
  assert.match(markup, /aria-label="Stapeloptionen"/);
});

test("deck summary row caps visual indentation at level six", () => {
  const deepDecks = Array.from({ length: 12 }, (_, index) => createCoreDeck({
    id: `deep-${index + 1}`,
    name: `Ebene ${index + 1}`,
    parentDeckId: index === 0 ? null : `deep-${index}`,
    hierarchyPath: Array.from({ length: index + 1 }, (__, pathIndex) => `Ebene ${pathIndex + 1}`),
    source: "manual",
    cards: [],
  }));
  const deepRow = createDeckLibraryModel(deepDecks).rows.at(-1)!;
  const markup = renderToStaticMarkup(
    <DeckSummaryRow
      row={deepRow}
      leadingControl={<span aria-hidden="true" />}
      actions={<button type="button" aria-label="Stapeloptionen" />}
      density="responsive"
    />,
  );

  assert.equal(deepRow.depth, 11);
  assert.match(markup, /padding-inline-start:calc\(5 \* var\(--core-deck-depth-indent, 8px\)\)/);
  assert.doesNotMatch(markup, /deck-hierarchy-overflow|lucide-git-branch/);
});

test("deck summary row omits the complete learning status block for management rows", () => {
  const markup = renderToStaticMarkup(
    <DeckSummaryRow
      row={row}
      leadingControl={<span aria-hidden="true" />}
      actions={<button type="button" aria-label="Stapeloptionen" />}
      density="responsive"
    />,
  );

  assert.doesNotMatch(markup, /data-deck-count=|Lernstand für|Gesamtfortschritt für|data-donut-/);
  assert.match(markup, /aria-label="Stapeloptionen"/);
});

test("deck summary row projects a tile with visible metric labels and no indentation", () => {
  const markup = renderToStaticMarkup(
    <DeckSummaryRow
      row={row}
      learningStatus={{ summary: row.summary, metricLabels: "sr-only" }}
      leadingControl={<span aria-hidden="true" />}
      actions={<button type="button" aria-label="Stapeloptionen" />}
      density="responsive"
      presentation="folder"
    />,
  );

  assert.match(markup, /padding-inline-start:0/);
  assert.doesNotMatch(markup, /padding-inline-start:calc/);
  for (const label of ["Neu", "Offen", "Fällig"]) assert.match(markup, new RegExp(`<dt class="(?![^"]*sr-only)[^"]*">${label}</dt>`));
});
