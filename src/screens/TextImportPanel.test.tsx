import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck } from "../coreModel.ts";
import { parseTextImport } from "../textImport.ts";
import { TextImportPanel, TextImportPreview } from "./TextImportPanel.tsx";

const actions = {
  listDeckContents: async () => [],
  onImport: async () => null,
  onCompleted: () => undefined,
  onImportingChange: () => undefined,
};

test("the text preview shows separator, rows, target deck, form, columns, duplicates, skipped rows and samples", () => {
  const parsed = parseTextImport("#deck:Vokabeln\nFrage;Antwort;Tags\nHerz;Pumpe;anatomie\nLunge;;\nNiere;Filter;", "vokabeln.csv");
  const markup = renderToStaticMarkup(<TextImportPreview parsed={parsed} fileName="vokabeln.csv" decks={[createCoreDeck({ id: "deck-a", name: "Anatomie", source: "manual", cards: [] })]} {...actions} />);

  assert.match(markup, /Trennzeichen[\s\S]*?>Semikolon</);
  assert.match(markup, /Zeilen[\s\S]*?>4</);
  assert.match(markup, /Neuer Stapel/);
  assert.match(markup, /value="Vokabeln"/);
  assert.match(markup, /Frage–Antwort/);
  assert.match(markup, /Aktualisieren/);
  assert.match(markup, />Spalte 1<\/span> · Frage/);
  assert.match(markup, /aria-label="Spalte 3"/);
  assert.match(markup, />3 Karten importieren</);
  assert.match(markup, /1 Zeile wird übersprungen/);
  assert.match(markup, /Zeile 4: Bitte eine Rückseite eingeben\./);
  assert.match(markup, /Kartenbeispiele/);
  assert.doesNotMatch(markup, /Originallayout|<a /);
});

test("the text panel names the file and offers another one while it reads", () => {
  const markup = renderToStaticMarkup(<TextImportPanel file={new File(["A;B"], "karten.txt")} decks={[]} onChooseOtherFile={() => undefined} onDraftStateChange={() => undefined} {...actions} />);
  assert.match(markup, /karten\.txt/);
  assert.match(markup, /Andere Datei auswählen/);
  assert.doesNotMatch(markup, /importieren</);
});
