import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck } from "../coreModel.ts";
import { createDemoAnatomyDeck } from "../coreWorkspace.ts";
import { CreationScreen } from "./CreationScreen.tsx";

const callbacks = {
  onMethodChange: () => undefined,
  onCreated: () => undefined,
  onAppendManualCard: () => undefined,
  onStartDeck: () => undefined,
  onReviewDeck: () => undefined,
  onOpenDashboard: () => undefined,
};

test("completed manual creation keeps its follow-up actions", () => {
  const deck = createDemoAnatomyDeck();
  const markup = renderToStaticMarkup(<CreationScreen decks={[deck]} completedDeckId={deck.id} {...callbacks} />);

  assert.match(markup, /Deine Karten sind bereit/);
  assert.match(markup, /Jetzt lernen/);
  assert.match(markup, /Karten prüfen/);
});

test("completed import shows the verified count and only study or dashboard actions", () => {
  const deck = createDemoAnatomyDeck();
  const markup = renderToStaticMarkup(
    <CreationScreen decks={[deck]} completedDeckId={deck.id} completedCount={46} completionKind="import" {...callbacks} />,
  );

  assert.match(markup, /Import abgeschlossen/);
  assert.match(markup, /Import erfolgreich/);
  assert.match(markup, /46 Karten wurden/);
  assert.match(markup, /Jetzt lernen/);
  assert.match(markup, /Zur Übersicht/);
  assert.doesNotMatch(markup, /Karten prüfen|Weitere Karten erstellen/);
});

test("creation entry presents the two concise creation methods", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} {...callbacks} />);

  assert.match(markup, /Neue Karte/);
  assert.match(markup, /Karten selbst erstellen/);
  assert.doesNotMatch(markup, /Schreibe Karten selbst oder mit einer PDF-Datei\.|Übernimm bestehende Stapel\./);
  assert.doesNotMatch(markup, /Core ·|Karten manuell erstellen|Front\/Back-Listen/);
});

test("import creation exposes only APKG without a format selector", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} initialMethod="import" {...callbacks} />);

  assert.match(markup, />Erstellen<\/button>/);
  assert.match(markup, /APKG-Dateien importieren/);
  assert.match(markup, /data-file-drop-field="true"/);
  assert.match(markup, />APKG-Datei auswählen<\/span>/);
  assert.doesNotMatch(markup, /Importformat|>APKG<|>Text<|>CSV<|>Excel\/Tabelle</);
});

test("manual source entry stays compact until the document field is requested", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} initialMethod="manual" {...callbacks} />);

  assert.match(markup, /<h2[^>]*>Karte selbst erstellen<\/h2>/);
  assert.match(markup, />Vorschau<\/span><\/button>/);
  assert.equal((markup.match(/PDF\/Text anfügen/g) ?? []).length, 1);
  assert.equal((markup.match(/data-file-drop-field="true"/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /Quelldatei auswählen oder ablegen/);
  assert.doesNotMatch(markup, /accept="\.txt,\.md,\.markdown,\.csv,\.tsv,\.pdf"/);
  assert.doesNotMatch(markup, /Live-Vorschau/);
  assert.doesNotMatch(markup, /Manuelle Erstellung|Karten manuell erstellen/);
  assert.doesNotMatch(markup, /\.docx/i);
});

test("manual target selection shows complete deck paths", () => {
  const parent = createCoreDeck({ id: "deck-parent", name: "Biologie", source: "manual", cards: [] });
  const child = createCoreDeck({ id: "deck-child", parentDeckId: parent.id, name: "Zelle", hierarchyPath: ["Biologie", "Zelle"], source: "manual", cards: [] });
  const markup = renderToStaticMarkup(
    <CreationScreen decks={[parent, child]} initialMethod="manual" initialTargetDeckId={child.id} {...callbacks} />,
  );

  assert.match(markup, /Biologie \/ Zelle/);
  assert.match(markup, /data-deck-select-trigger="true"/);
  assert.match(markup, /data-deck-icon="true"/);
  assert.match(markup, /Fertig/);
});

test("manual options use labeled segmented choices without explanatory subclaims", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} initialMethod="manual" {...callbacks} />);

  assert.match(markup, /class="flex min-w-0 flex-wrap items-center justify-between gap-4" data-testid="manual-card-options"/);
  assert.match(markup, />Fragentyp</);
  assert.match(markup, /aria-label="Fragentyp"[^>]*core-segmented-control/);
  assert.match(markup, />Single Choice</);
  assert.match(markup, />Multiple Choice</);
  assert.match(markup, />Lernrichtung</);
  assert.match(markup, /aria-label="Lernrichtung"[^>]*core-segmented-control/);
  assert.match(markup, />Beide Richtungen</);
  assert.doesNotMatch(markup, /Weitere Optionen|role="switch"|Antwortoptionen statt freier Antwort verwenden|Vorder- und Rückseite zusätzlich umgekehrt abfragen/);
});

test("manual media and additional fields stay visible without disclosures", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} initialMethod="manual" {...callbacks} />);

  assert.equal((markup.match(/>Bild zur Vorderseite einfügen \(optional\)<\/span>/g) ?? []).length, 1);
  assert.equal((markup.match(/>Bild zur Rückseite einfügen \(optional\)<\/span>/g) ?? []).length, 1);
  assert.match(markup, /aria-label="Bild zur Vorderseite einfügen \(optional\): Bild einfügen oder ablegen"/);
  assert.match(markup, /aria-label="Bild zur Rückseite einfügen \(optional\): Bild einfügen oder ablegen"/);
  assert.match(markup, />Feld hinzufügen<\/span><\/button>/);
  assert.doesNotMatch(markup, /<details|<summary|Weitere Felder/);
});
