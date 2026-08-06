import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck } from "../coreModel.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { CompactDeckSummaryRow } from "./CompactDeckSummaryRow.tsx";

test("compact deck row keeps one-line identity, accessible metrics and compact progress", () => {
  const parent = createCoreDeck({ id: "parent", name: "Herkunft", hierarchyPath: ["Herkunft"], source: "manual", cards: [] });
  const child = createCoreDeck({ id: "child", parentDeckId: parent.id, name: "Ein sehr langer Unterstapelname", hierarchyPath: ["Herkunft", "Ein sehr langer Unterstapelname"], source: "manual", cards: [] });
  const row = createDeckLibraryModel([parent, child]).rows[1];
  const markup = renderToStaticMarkup(
    <CompactDeckSummaryRow
      row={row}
      summary={row.summary}
      progress={row.progress}
      leadingControl={<button type="button" aria-label="Unterstapel einklappen" />}
      actions={<button type="button" aria-label="Stapeloptionen" />}
    />,
  );

  assert.match(markup, /data-deck-summary-row-content="compact"/);
  assert.match(markup, /truncate whitespace-nowrap/);
  assert.doesNotMatch(markup, />Herkunft \/ Ein sehr langer Unterstapelname</);
  for (const metric of ["new", "due", "total"]) assert.match(markup, new RegExp(`data-deck-count="${metric}"`));
  for (const label of ["Neu", "Fällig", "Gesamt"]) assert.match(markup, new RegExp(`<dt class="sr-only">${label}</dt>`));
  assert.match(markup, /size-8/);
  assert.match(markup, /aria-label="0 Prozent"/);
  assert.match(markup, /aria-label="Stapeloptionen"/);
});
