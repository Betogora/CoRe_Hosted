import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addRephrasedVariant, createBasicLearningItem, createCoreDeck } from "../coreModel.ts";
import { StudyMode } from "./StudyMode.tsx";
import { ratingButtons } from "./screenConstants.ts";

test("review ratings use clear German accessible labels", () => {
  assert.deepEqual(ratingButtons.map(({ number, label }) => `${number} ${label}`), ["1 Nochmal", "2 Schwer", "3 Gut", "4 Leicht"]);
});

test("StudyMode exposes no origin or scheduler hints before reveal", () => {
  const item = addRephrasedVariant(
    createBasicLearningItem("deck_study", "Welche Hauptstadt hat Côte d'Ivoire?", "Yamoussoukro", {
      reviewState: {
        state: "review",
        repetitions: 4,
        maturityXp: 140,
        preferredVariantLevel: 2,
        dueAt: "2026-07-01T08:00:00.000Z",
      },
    }),
    "Nenne die Hauptstadt von Côte d'Ivoire.",
    "Yamoussoukro",
    { variantLevel: 2 },
  );
  const deck = createCoreDeck({
    id: "deck_study",
    name: "Geografie",
    source: "manual",
    cards: [item],
    reviewEvents: [],
  });

  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      deckId={deck.id}
      variantSession
      onExit={() => undefined}
      onDeckUpdated={() => undefined}
    />,
  );

  assert.match(markup, /Nenne die Hauptstadt/);
  assert.match(markup, /Antwort anzeigen/);
  assert.doesNotMatch(markup, /Original|Variante|Level|fsrs|Reifegrad/i);
  assert.doesNotMatch(markup, /original-anchor|source-anchor|schedulerVersion|variantLevel|generationSource/i);
});
