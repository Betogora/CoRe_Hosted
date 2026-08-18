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

test("manual picker accepts only readable source documents", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} initialMethod="manual" {...callbacks} />);

  assert.match(markup, /accept="\.txt,\.md,\.markdown,\.csv,\.tsv,\.pdf"/);
  assert.match(markup, /<h2[^>]*>Karte selbst erstellen<\/h2>/);
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
