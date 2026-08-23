import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addRephrasedVariant, createBasicLearningItem, createCoreDeck } from "../coreModel.ts";
import { StudyMode } from "./StudyMode.tsx";
import { formatReviewIntervalLabel, ratingButtons } from "./screenConstants.ts";

test("review ratings keep their German labels, shortcuts and canonical color order", () => {
  assert.deepEqual(
    ratingButtons.map(({ shortcutKey, label, className }) => ({ shortcutKey, label, className })),
    [
      { shortcutKey: "1", label: "Nochmal", className: "border-core-success bg-core-success-soft text-core-text" },
      { shortcutKey: "2", label: "Schwer", className: "border-core-danger bg-core-danger-soft text-core-text" },
      { shortcutKey: "3", label: "Gut", className: "border-core-warning bg-core-warning-soft text-core-text" },
      { shortcutKey: "4", label: "Leicht", className: "border-core-info bg-core-info-soft text-core-text" },
    ],
  );
});

test("review intervals abbreviate only minutes with lowercase min", () => {
  assert.equal(formatReviewIntervalLabel("5 Min."), "5 min");
  assert.equal(formatReviewIntervalLabel("15 Min."), "15 min");
  assert.equal(formatReviewIntervalLabel("1 Tag"), "1 Tag");
  assert.equal(formatReviewIntervalLabel("7 Tage"), "7 Tage");
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
      simulationOffsetMinutes={0}
      pomodoroTimer={null}
      onStartPomodoro={() => undefined}
      onExit={() => undefined}
      onReturnToLearn={() => undefined}
      onEditCard={() => undefined}
      onEditDeck={() => undefined}
      onSetCardStudyState={() => deck}
      onSetDeckReviewOrder={() => deck}
      onCardUpdated={() => undefined}
      onReview={() => undefined}
    />,
  );

  assert.match(markup, /Nenne die Hauptstadt/);
  assert.match(markup, /Antwort anzeigen/);
  assert.match(markup, /core-study-card/);
  assert.match(markup, /core-study-card-front/);
  assert.doesNotMatch(markup, /core-study-card[^"]*min-h/);
  assert.doesNotMatch(markup, />Frage<\/p>|>Antwort<\/p>/);
  assert.doesNotMatch(markup, /core-study-card core-surface-raised/);
  assert.doesNotMatch(markup, /Original|Variante|Level|fsrs|Reifegrad/i);
  assert.doesNotMatch(markup, /original-anchor|source-anchor|schedulerVersion|variantLevel|generationSource/i);
});

test("StudyMode uses a simulated same-day minute offset for queue and visible status", () => {
  const item = createBasicLearningItem("deck_future", "Zukunftsfrage", "Zukunftsantwort", {
    reviewState: {
      state: "learning",
      repetitions: 2,
      dueAt: "2026-08-06T10:10:00.000Z",
    },
  });
  const deck = createCoreDeck({ id: "deck_future", name: "Zukunft", source: "manual", cards: [item], reviewEvents: [] });
  const commonProps = {
    deck,
    decks: [deck],
    deckId: deck.id,
    variantSession: false,
    learnAheadMinutes: 0,
    mediaStore: null,
    pomodoroTimer: null,
    onStartPomodoro: () => undefined,
    onExit: () => undefined,
    onReturnToLearn: () => undefined,
    onEditCard: () => undefined,
    onEditDeck: () => undefined,
    onSetCardStudyState: () => deck,
    onSetDeckReviewOrder: () => deck,
    onCardUpdated: () => undefined,
    onReview: () => undefined,
  };

  const todayMarkup = renderToStaticMarkup(
    <StudyMode {...commonProps} getNow={() => "2026-08-06T10:00:00.000Z"} simulationOffsetMinutes={0} />,
  );
  const futureMarkup = renderToStaticMarkup(
    <StudyMode {...commonProps} getNow={() => "2026-08-06T10:10:00.000Z"} simulationOffsetMinutes={10} />,
  );

  assert.doesNotMatch(todayMarkup, /Zukunftsfrage/);
  assert.match(futureMarkup, /Zukunftsfrage/);
  assert.match(futureMarkup, /Simulation aktiv/);
  assert.match(futureMarkup, /\+10 Minuten/);
});

test("StudyMode exposes labeled learning without an idle Pomodoro progress", () => {
  const item = createBasicLearningItem("deck_progress", "Frage", "Antwort", {
    reviewState: { state: "new", dueAt: "2026-08-06T09:00:00.000Z", reps: 0 },
  });
  const deck = createCoreDeck({ id: "deck_progress", name: "Fortschritt", source: "manual", cards: [item], reviewEvents: [] });
  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      deckId={deck.id}
      variantSession={false}
      mediaStore={null}
      getNow={() => "2026-08-06T10:00:00.000Z"}
      simulationOffsetMinutes={0}
      pomodoroTimer={null}
      onStartPomodoro={() => undefined}
      onExit={() => undefined}
      onReturnToLearn={() => undefined}
      onEditCard={() => undefined}
      onEditDeck={() => undefined}
      onSetCardStudyState={() => deck}
      onSetDeckReviewOrder={() => deck}
      onCardUpdated={() => undefined}
      onReview={() => undefined}
    />,
  );

  assert.match(markup, /Lernfortschritt/);
  assert.match(markup, /aria-valuetext="Gelernt: 0 Karten, Neu: 1 Karte, Offen: 0 Karten, Fällig: 0 Karten"/);
  assert.doesNotMatch(markup, /Pomodoro-Timer|Nicht gestartet|study-pomodoro-progress/);
  assert.doesNotMatch(markup, /Neue Karten heute|heute eingeführt|\+10/);
});

test("StudyMode renders the four daily progress segments in the canonical order and colors", () => {
  const deckId = "deck_segmented_progress";
  const learned = createBasicLearningItem(deckId, "Gelernt", "Antwort", {
    id: "learned_today",
    reviewState: { state: "review", reps: 5, dueAt: "2026-08-10T10:00:00.000Z" },
  });
  const inProgress = createBasicLearningItem(deckId, "Offen", "Antwort", {
    id: "in_progress",
    reviewState: { state: "relearning", reps: 5, dueAt: "2026-08-09T10:15:00.000Z" },
  });
  const newCards = Array.from({ length: 3 }, (_value, index) => createBasicLearningItem(deckId, `Neu ${index + 1}`, "Antwort", {
    id: `new_${index + 1}`,
    reviewState: { state: "new", reps: 0, dueAt: "2026-08-09T10:00:00.000Z" },
  }));
  const dueCards = Array.from({ length: 5 }, (_value, index) => createBasicLearningItem(deckId, `Fällig ${index + 1}`, "Antwort", {
    id: `due_${index + 1}`,
    reviewState: { state: "review", reps: 4, dueAt: "2026-08-09T09:00:00.000Z" },
  }));
  const deck = createCoreDeck({
    id: deckId,
    name: "Segmentierter Fortschritt",
    source: "manual",
    deckSettings: { newCardsPerDay: 3, maximumReviewsPerDay: 10 },
    cards: [learned, inProgress, ...newCards, ...dueCards],
    reviewEvents: [
      {
        id: "learned_event",
        deckId,
        learningItemId: learned.id,
        answeredAt: "2026-08-09T08:00:00.000Z",
        schedulerBefore: { card: { state: "review", reps: 4 } },
      },
      {
        id: "in_progress_event",
        deckId,
        learningItemId: inProgress.id,
        answeredAt: "2026-08-09T08:05:00.000Z",
        schedulerBefore: { card: { state: "review", reps: 4 } },
      },
    ] as any,
  });
  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      deckId={deck.id}
      variantSession={false}
      mediaStore={null}
      getNow={() => "2026-08-09T10:00:00.000Z"}
      simulationOffsetMinutes={0}
      pomodoroTimer={null}
      onStartPomodoro={() => undefined}
      onExit={() => undefined}
      onReturnToLearn={() => undefined}
      onEditCard={() => undefined}
      onEditDeck={() => undefined}
      onSetCardStudyState={() => deck}
      onSetDeckReviewOrder={() => deck}
      onCardUpdated={() => undefined}
      onReview={() => undefined}
    />,
  );

  assert.match(markup, />1 \/ 10 Karten</);
  assert.match(markup, /aria-valuetext="Gelernt: 1 Karte, Neu: 3 Karten, Offen: 1 Karte, Fällig: 5 Karten"/);
  assert.match(markup, /data-study-progress-segment="learned"[^>]*background-color:var\(--core-learning-status-learned\)[^>]*flex-grow:1/);
  assert.match(markup, /data-study-progress-segment="new"[^>]*background-color:var\(--core-learning-status-new\)[^>]*flex-grow:3/);
  assert.match(markup, /data-study-progress-segment="in-progress"[^>]*background-color:var\(--core-learning-status-in-progress\)[^>]*flex-grow:1/);
  assert.match(markup, /data-study-progress-segment="due"[^>]*background-color:var\(--core-learning-status-due\)[^>]*flex-grow:5/);
  for (const [label, color, value] of [
    ["Gelernt", "learned", "1 Karte"],
    ["Neu", "new", "3 Karten"],
    ["Offen", "in-progress", "1 Karte"],
    ["Fällig", "due", "5 Karten"],
  ]) {
    assert.match(markup, new RegExp(`data-core-tooltip="${label}"`));
    assert.match(markup, new RegExp(`data-core-tooltip-swatch="var\\(--core-learning-status-${color}\\)"`));
    assert.match(markup, new RegExp(`data-core-tooltip-value="${value}"`));
  }
  assert.ok(markup.indexOf('data-study-progress-segment="learned"') < markup.indexOf('data-study-progress-segment="new"'));
  assert.ok(markup.indexOf('data-study-progress-segment="new"') < markup.indexOf('data-study-progress-segment="in-progress"'));
  assert.ok(markup.indexOf('data-study-progress-segment="in-progress"') < markup.indexOf('data-study-progress-segment="due"'));
});

test("StudyMode says Für jetzt geschafft while same-day learning steps are still waiting", () => {
  const item = createBasicLearningItem("deck_waiting", "Später", "Antwort", {
    reviewState: { state: "learning", reps: 1, dueAt: "2026-08-09T10:30:00.000Z" },
  });
  const deck = createCoreDeck({
    id: "deck_waiting",
    name: "Wartend",
    source: "manual",
    deckSettings: { learnAheadMinutes: 20 },
    cards: [item],
  });
  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      deckId={deck.id}
      variantSession={false}
      mediaStore={null}
      getNow={() => "2026-08-09T10:00:00.000Z"}
      simulationOffsetMinutes={0}
      pomodoroTimer={null}
      onStartPomodoro={() => undefined}
      onExit={() => undefined}
      onReturnToLearn={() => undefined}
      onEditCard={() => undefined}
      onEditDeck={() => undefined}
      onSetCardStudyState={() => deck}
      onSetDeckReviewOrder={() => deck}
      onCardUpdated={() => undefined}
      onReview={() => undefined}
    />,
  );

  assert.match(markup, /Für jetzt geschafft/);
  assert.match(markup, /bleiben „Offen“/);
  assert.doesNotMatch(markup, /Später/);
});

test("StudyMode explains when every due card is hidden by the daily limit", () => {
  const item = createBasicLearningItem("deck_limited", "Begrenzt", "Antwort", {
    reviewState: { state: "review", reps: 4, dueAt: "2026-08-09T09:00:00.000Z" },
  });
  const deck = createCoreDeck({
    id: "deck_limited",
    name: "Begrenzt",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 0 },
    cards: [item],
  });
  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      deckId={deck.id}
      variantSession={false}
      mediaStore={null}
      getNow={() => "2026-08-09T10:00:00.000Z"}
      simulationOffsetMinutes={0}
      pomodoroTimer={null}
      onStartPomodoro={() => undefined}
      onExit={() => undefined}
      onReturnToLearn={() => undefined}
      onEditCard={() => undefined}
      onEditDeck={() => undefined}
      onSetCardStudyState={() => deck}
      onSetDeckReviewOrder={() => deck}
      onCardUpdated={() => undefined}
      onReview={() => undefined}
    />,
  );

  assert.match(markup, /Tageslimit erreicht/);
  assert.match(markup, /1 fällige Karte bleibt wegen deiner Tageslimits/);
  assert.doesNotMatch(markup, /Keine fälligen Karten/);
});
