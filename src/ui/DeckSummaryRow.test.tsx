import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck } from "../coreModel.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { DeckSummaryRow } from "./DeckSummaryRow.tsx";

const parent = createCoreDeck({ id: "parent", name: "Herkunft", hierarchyPath: ["Herkunft"], source: "manual", cards: [] });
const child = createCoreDeck({ id: "child", parentDeckId: parent.id, name: "Ein sehr langer Unterstapelname", hierarchyPath: ["Herkunft", "Ein sehr langer Unterstapelname"], source: "manual", cards: [] });
const row = createDeckLibraryModel([parent, child]).rows[1];

test("deck summary row keeps responsive identity, accessible metrics and compact progress", () => {
  const markup = renderToStaticMarkup(
    <DeckSummaryRow
      row={row}
      learningStatus={{ summary: row.summary, statusDistribution: row.statusDistribution }}
      leadingControl={<button type="button" aria-label="Unterstapel einklappen" />}
      actions={<button type="button" aria-label="Stapeloptionen" />}
      density="compact"
    />,
  );

  assert.match(markup, /data-deck-summary-row-content="compact"/);
  assert.match(markup, /core-deck-summary-name/);
  assert.doesNotMatch(markup, /truncate whitespace-nowrap/);
  assert.doesNotMatch(markup, />Herkunft \/ Ein sehr langer Unterstapelname</);
  for (const metric of ["new", "in-progress", "due"]) assert.match(markup, new RegExp(`data-deck-count="${metric}"`));
  for (const label of ["Neu", "Offen", "Fällig"]) assert.match(markup, new RegExp(`<dt class="sr-only">${label}</dt>`));
  assert.doesNotMatch(markup, /data-deck-count="total"|>Gesamt</);
  assert.match(markup, /size-8/);
  assert.match(markup, /padding-inline-start:16px/);
  assert.match(markup, /aria-label="Keine aktiven Karten für Herkunft \/ Ein sehr langer Unterstapelname\."/);
  assert.match(markup, /data-donut-empty="true"/);
  assert.match(markup, /aria-label="Stapeloptionen"/);
});

test("deck summary row marks a flattened Anki hierarchy without changing the deck name", () => {
  const imported = createCoreDeck({
    id: "flattened",
    name: "J",
    source: "anki-apkg",
    hierarchyPath: ["A", "B", "C", "D", "E", "F", "G", "J"],
    importMeta: { sourceMetadata: { ankiDeckPath: "A::B::C::D::E::F::G::H::I::J" } },
    cards: [],
  });
  const importedRow = createDeckLibraryModel([imported]).rows[0];
  const markup = renderToStaticMarkup(
    <DeckSummaryRow
      row={importedRow}
      leadingControl={<span aria-hidden="true" />}
      actions={<button type="button" aria-label="Stapeloptionen" />}
      density="responsive"
    />,
  );

  assert.match(markup, />J</);
  assert.match(markup, /data-testid="deck-hierarchy-overflow-flattened"/);
  assert.match(markup, /data-core-tooltip="Tiefere Anki-Unterteilung wurde abgeflacht"/);
  assert.match(markup, /lucide-git-branch/);
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

  assert.match(markup, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.doesNotMatch(markup, /data-deck-count=|Lernstand für|Gesamtfortschritt für|data-donut-/);
  assert.match(markup, /aria-label="Stapeloptionen"/);
});
