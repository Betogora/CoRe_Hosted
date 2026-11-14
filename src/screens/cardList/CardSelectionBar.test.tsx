import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CardSelectionBar } from "./CardSelectionBar.tsx";

const props = {
  allHits: false,
  searching: true,
  disabled: false,
  onSelectAllHits: () => undefined,
  onClear: () => undefined,
  decks: [],
  flagNames: [],
  loadTagDirectory: async () => [],
  now: "2026-11-09T10:00:00.000Z",
  onRun: async () => undefined,
};

const text = (markup: string) => markup.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("die Auswahlleiste nennt die Auswahl und bietet alle Treffer an, solange es mehr gibt (KV4)", () => {
  const some = renderToStaticMarkup(<CardSelectionBar {...props} count={3} hitTotal={1200} />);
  assert.match(text(some), /3 Karten ausgewählt/);
  assert.match(text(some), /Alle 1\.200 Treffer auswählen/);
  assert.match(some, /data-state="checked"><span class="core-checkbox-control"><input type="checkbox" aria-label="Auswahl aufheben" checked=""/, "das angehakte Kopfkästchen beendet die Auswahl");
  const all = text(renderToStaticMarkup(<CardSelectionBar {...props} count={1200} hitTotal={1200} allHits />));
  assert.match(all, /Alle 1\.200 Karten ausgewählt/);
  assert.doesNotMatch(all, /Treffer auswählen/);
  assert.doesNotMatch(text(renderToStaticMarkup(<CardSelectionBar {...props} count={1} hitTotal={null} />)), /Treffer auswählen/, "ohne bekannte Zahl kein Angebot");
  assert.match(text(renderToStaticMarkup(<CardSelectionBar {...props} searching={false} count={1} hitTotal={40} />)), /Alle 40 Karten auswählen/, "ohne Suche heißt es Karten (KV3b)");
  assert.match(renderToStaticMarkup(<CardSelectionBar {...props} count={0} hitTotal={5} disabled />), /<button type="button" disabled=""[^>]*data-testid="card-selection-actions"/);
});
