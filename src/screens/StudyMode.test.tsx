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
      mediaStore={null}
      getNow={() => "2026-07-06T10:00:00.000Z"}
      simulationDayOffset={0}
      onExit={() => undefined}
      onReturnToLearn={() => undefined}
      onEditCard={() => undefined}
      onSaveDeckDailyLimits={() => deck}
      onSetCardStudyState={() => deck}
      onDeckUpdated={() => undefined}
      onReviewEvent={() => undefined}
    />,
  );

  assert.match(markup, /Nenne die Hauptstadt/);
  assert.match(markup, /Antwort anzeigen/);
  assert.match(markup, /core-study-card/);
  assert.match(markup, /core-study-card-front/);
  assert.doesNotMatch(markup, /Original|Variante|Level|fsrs|Reifegrad/i);
  assert.doesNotMatch(markup, /original-anchor|source-anchor|schedulerVersion|variantLevel|generationSource/i);
});

test("StudyMode uses the simulated learning time for queue and visible status", () => {
  const item = createBasicLearningItem("deck_future", "Zukunftsfrage", "Zukunftsantwort", {
    reviewState: {
      state: "review",
      repetitions: 2,
      dueAt: "2026-08-09T09:00:00.000Z",
    },
  });
  const deck = createCoreDeck({ id: "deck_future", name: "Zukunft", source: "manual", cards: [item], reviewEvents: [] });
  const commonProps = {
    deck,
    decks: [deck],
    deckId: deck.id,
    variantSession: false,
    mediaStore: null,
    onExit: () => undefined,
    onReturnToLearn: () => undefined,
    onEditCard: () => undefined,
    onSaveDeckDailyLimits: () => deck,
    onSetCardStudyState: () => deck,
    onDeckUpdated: () => undefined,
    onReviewEvent: () => undefined,
  };

  const todayMarkup = renderToStaticMarkup(
    <StudyMode {...commonProps} getNow={() => "2026-08-06T10:00:00.000Z"} simulationDayOffset={0} />,
  );
  const futureMarkup = renderToStaticMarkup(
    <StudyMode {...commonProps} getNow={() => "2026-08-09T10:00:00.000Z"} simulationDayOffset={3} />,
  );

  assert.doesNotMatch(todayMarkup, /Zukunftsfrage/);
  assert.match(futureMarkup, /Zukunftsfrage/);
  assert.match(futureMarkup, /Simulation aktiv/);
  assert.match(futureMarkup, /\+3 Tage/);
});

test("StudyMode exposes labeled learning and placeholder Pomodoro progress without the former inline limit", () => {
  const item = createBasicLearningItem("deck_progress", "Frage", "Antwort");
  const deck = createCoreDeck({ id: "deck_progress", name: "Fortschritt", source: "manual", cards: [item], reviewEvents: [] });
  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      deckId={deck.id}
      variantSession={false}
      mediaStore={null}
      getNow={() => "2026-08-06T10:00:00.000Z"}
      simulationDayOffset={0}
      onExit={() => undefined}
      onReturnToLearn={() => undefined}
      onEditCard={() => undefined}
      onSaveDeckDailyLimits={() => deck}
      onSetCardStudyState={() => deck}
      onDeckUpdated={() => undefined}
      onReviewEvent={() => undefined}
    />,
  );

  assert.match(markup, /Lernfortschritt/);
  assert.match(markup, /Pomodoro · 25 Min\./);
  assert.match(markup, /study-pomodoro-progress/);
  assert.doesNotMatch(markup, /Neue Karten heute|heute eingeführt|\+10/);
});
