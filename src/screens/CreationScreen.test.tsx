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
};

test("completed first creation offers study and card-review actions", () => {
  const deck = createDemoAnatomyDeck();
  const markup = renderToStaticMarkup(<CreationScreen decks={[deck]} completedDeckId={deck.id} {...callbacks} />);

  assert.match(markup, /Deine Karten sind bereit/);
  assert.match(markup, /Jetzt lernen/);
  assert.match(markup, /Karten prüfen/);
});

test("creation entry exposes only the two Core methods", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} {...callbacks} />);

  assert.match(markup, /Core · Manuell/);
  assert.match(markup, /Core · APKG/);
  assert.doesNotMatch(markup, /Labs|Entwurfsassistent|KI/);
});

test("manual picker accepts only readable source documents", () => {
  const markup = renderToStaticMarkup(<CreationScreen decks={[]} initialMethod="manual" {...callbacks} />);

  assert.match(markup, /accept="\.txt,\.md,\.markdown,\.csv,\.tsv,\.pdf"/);
  assert.doesNotMatch(markup, /\.docx/i);
});

test("manual target selection shows complete deck paths", () => {
  const parent = createCoreDeck({ id: "deck-parent", name: "Biologie", source: "manual", cards: [] });
  const child = createCoreDeck({ id: "deck-child", parentDeckId: parent.id, name: "Zelle", hierarchyPath: ["Biologie", "Zelle"], source: "manual", cards: [] });
  const markup = renderToStaticMarkup(
    <CreationScreen decks={[parent, child]} initialMethod="manual" initialTargetDeckId={child.id} {...callbacks} />,
  );

  assert.match(markup, /Biologie \/ Zelle/);
  assert.match(markup, /Fertig/);
});
