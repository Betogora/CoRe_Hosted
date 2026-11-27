import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addCardVariant, cardStudyFromReviewState, createBasicNote, createCoreDeck, createReviewState } from "../coreModel.ts";
import type { Card, Deck, Note, ReviewEvent } from "../coreTypes.ts";
import { variantPresentation } from "../coreVariantService.ts";
import { createPomodoroTimer } from "../pomodoroTimer.ts";
import { StudyMode } from "./StudyMode.tsx";
import { formatReviewIntervalLabel, ratingButtons } from "./screenConstants.ts";

function basicItem(deckId: string, front: string, back: string, { id, review = {} }: { id?: string; review?: Record<string, unknown> } = {}): { note: Note; card: Card } {
  const { note, cards: [card] } = createBasicNote(deckId, front, back);
  return { note, card: { ...card, id: id ?? card.id, study: cardStudyFromReviewState(createReviewState(review)) } };
}

function reviewEvent(id: string, deckId: string, cardId: string, answeredAt: string, schedulerBefore: unknown): ReviewEvent {
  return { id, userId: "local-user", deckId, cardId, variantId: null, rating: "good", answeredAt, responseTimeMs: null, schedulerBefore, schedulerAfter: null, flags: {}, createdAt: answeredAt };
}

/** The header's still-open counts of the day, in the order of the progress bar. */
function assertOpenCounts(markup: string, counts: { new: number; open: number; due: number }) {
  assert.match(markup, new RegExp(`data-testid="study-open-counts">.*?>Neu</dt><dd[^>]*>${counts.new}<.*?>Offen</dt><dd[^>]*>${counts.open}<.*?>Fällig</dt><dd[^>]*>${counts.due}<`));
}

function studyCallbacks(deck: Deck, notes: Note[]) {
  return {
    mediaStore: null,
    pomodoroTimer: null,
    onStartPomodoro: () => undefined,
    onPomodoroPauseChange: () => undefined,
    onExit: () => undefined,
    onReturnToLearn: () => undefined,
    onEditCard: () => undefined,
    onEditDeck: () => undefined,
    flagNames: [],
    onSetCardStudyState: () => ({ deck, note: notes[0] }),
    onSetDeckReviewOrder: () => deck,
    onReview: () => undefined,
    onUndoReview: () => null,
    onAskCardHelp: async () => "",
  };
}

test("review ratings keep their German labels, shortcuts and canonical color order", () => {
  assert.deepEqual(
    ratingButtons.map(({ shortcutKey, label, className }) => ({ shortcutKey, label, className })),
    [
      { shortcutKey: "1", label: "Nochmal", className: "core-rating-again" },
      { shortcutKey: "2", label: "Schwer", className: "core-rating-hard" },
      { shortcutKey: "3", label: "Gut", className: "core-rating-good" },
      { shortcutKey: "4", label: "Leicht", className: "core-rating-easy" },
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
  const base = basicItem("deck_study", "Welche Hauptstadt hat Côte d'Ivoire?", "Yamoussoukro", {
    review: {
      state: "review",
      repetitions: 4,
      maturityBand: "mature",
      dueAt: "2026-07-01T08:00:00.000Z",
    },
  });
  const card = addCardVariant(base.card, { front: "Nenne die Hauptstadt von Côte d'Ivoire.", back: "Yamoussoukro", variantLevel: 2 });
  const deck = createCoreDeck({
    id: "deck_study",
    name: "Geografie",
    source: "manual",
    cards: [card],
    reviewEvents: [],
  });

  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      notes={[base.note]}
      deckId={deck.id}
      getNow={() => "2026-07-06T10:00:00.000Z"}
      simulationOffsetMinutes={0}
      {...studyCallbacks(deck, [base.note])}
    />,
  );

  assert.match(markup, /Kartendarstellung wird vorbereitet …/);
  assert.match(markup, /data-testid="study-card-content"/);
  assert.match(markup, /Antwort anzeigen/);
  assert.doesNotMatch(markup, /KI hilft/);
  assert.match(markup, /core-study-card/);
  assert.doesNotMatch(markup, /core-study-card[^"]*min-h/);
  assert.doesNotMatch(markup, />Frage<\/p>|>Antwort<\/p>/);
  assert.doesNotMatch(markup, /core-study-card core-surface-raised/);
  assert.doesNotMatch(markup, /Original|Variante|Level|fsrs|Reifegrad/i);
  assert.doesNotMatch(markup, /original-anchor|source-anchor|schedulerVersion|variantLevel|generationSource/i);
  assert.doesNotMatch(markup, /Grundkarte|Nicht mehr zeigen|Problem melden/);

  const presented = variantPresentation(base.note, card, card.variants[0]);
  assert.deepEqual(presented.note.content.fields.map((field) => [field.role, field.html]), [
    ["prompt", "Nenne die Hauptstadt von Côte d'Ivoire."],
    ["answer", "Yamoussoukro"],
  ]);
  assert.equal(presented.card.id, card.variants[0].id);
});

test("StudyMode uses a simulated same-day minute offset for queue and visible status", () => {
  const item = basicItem("deck_future", "Zukunftsfrage", "Zukunftsantwort", {
    review: {
      state: "learning",
      repetitions: 2,
      dueAt: "2026-08-06T10:10:00.000Z",
    },
  });
  const deck = createCoreDeck({ id: "deck_future", name: "Zukunft", source: "manual", cards: [item.card], reviewEvents: [] });
  const commonProps = {
    deck,
    decks: [deck],
    notes: [item.note],
    deckId: deck.id,
    learnAheadMinutes: 0,
    ...studyCallbacks(deck, [item.note]),
  };

  const todayMarkup = renderToStaticMarkup(
    <StudyMode {...commonProps} getNow={() => "2026-08-06T10:00:00.000Z"} simulationOffsetMinutes={0} />,
  );
  const futureMarkup = renderToStaticMarkup(
    <StudyMode {...commonProps} getNow={() => "2026-08-06T10:10:00.000Z"} simulationOffsetMinutes={10} />,
  );

  assert.doesNotMatch(todayMarkup, /data-testid="study-card-content"|Antwort anzeigen/);
  assert.match(futureMarkup, /data-testid="study-card-content"/);
  assert.match(futureMarkup, /Antwort anzeigen/);
  assert.match(futureMarkup, /Simulation aktiv/);
  assert.match(futureMarkup, /\+10 Minuten/);
});

test("StudyMode shows a loading status instead of an empty card while the content is missing", () => {
  const item = basicItem("deck_missing_note", "Frage", "Antwort", {
    review: { state: "new", dueAt: "2026-08-06T09:00:00.000Z", reps: 0 },
  });
  const deck = createCoreDeck({ id: "deck_missing_note", name: "Ohne Inhalt", source: "manual", cards: [item.card], reviewEvents: [] });
  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      notes={[]}
      deckId={deck.id}
      getNow={() => "2026-08-06T10:00:00.000Z"}
      simulationOffsetMinutes={0}
      {...studyCallbacks(deck, [item.note])}
    />,
  );

  assert.match(markup, /Karteninhalt wird geladen …/);
  assert.doesNotMatch(markup, /Kartendarstellung wird vorbereitet/);
});

test("StudyMode exposes labeled learning without an idle Lerntimer", () => {
  const item = basicItem("deck_progress", "Frage", "Antwort", {
    review: { state: "new", dueAt: "2026-08-06T09:00:00.000Z", reps: 0 },
  });
  const deck = createCoreDeck({ id: "deck_progress", name: "Fortschritt", source: "manual", cards: [item.card], reviewEvents: [] });
  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      notes={[item.note]}
      deckId={deck.id}
      getNow={() => "2026-08-06T10:00:00.000Z"}
      simulationOffsetMinutes={0}
      {...studyCallbacks(deck, [item.note])}
    />,
  );

  assert.match(markup, /aria-label="Lernfortschritt"/);
  assert.doesNotMatch(markup, />Lernfortschritt</);
  assert.match(markup, /<header class="core-study-header"[^>]*>.*>Fortschritt<\/p><span[^>]*><dl[^>]*data-testid="study-open-counts"/);
  assertOpenCounts(markup, { new: 1, open: 0, due: 0 });
  assert.match(markup, /aria-valuetext="Gelernt: 0 Karten, Neu: 1 Karte, Offen: 0 Karten, Fällig: 0 Karten"/);
  assert.doesNotMatch(markup, /Lerntimer|data-pomodoro-pill|Nicht gestartet/);
  assert.doesNotMatch(markup, /Neue Karten heute|heute eingeführt|\+10/);
});

test("StudyMode counts learned, new, open and due cards of the day into its progress", () => {
  const deckId = "deck_segmented_progress";
  const learned = basicItem(deckId, "Gelernt", "Antwort", {
    id: "learned_today",
    review: { state: "review", reps: 5, dueAt: "2026-08-10T10:00:00.000Z" },
  });
  const inProgress = basicItem(deckId, "Offen", "Antwort", {
    id: "in_progress",
    review: { state: "relearning", reps: 5, dueAt: "2026-08-09T10:15:00.000Z" },
  });
  const newItems = Array.from({ length: 3 }, (_value, index) => basicItem(deckId, `Neu ${index + 1}`, "Antwort", {
    id: `new_${index + 1}`,
    review: { state: "new", reps: 0, dueAt: "2026-08-09T10:00:00.000Z" },
  }));
  const dueItems = Array.from({ length: 5 }, (_value, index) => basicItem(deckId, `Fällig ${index + 1}`, "Antwort", {
    id: `due_${index + 1}`,
    review: { state: "review", reps: 4, dueAt: "2026-08-09T09:00:00.000Z" },
  }));
  const items = [learned, inProgress, ...newItems, ...dueItems];
  const deck = createCoreDeck({
    id: deckId,
    name: "Segmentierter Fortschritt",
    source: "manual",
    deckSettings: { newCardsPerDay: 3, maximumReviewsPerDay: 10 },
    cards: items.map((item) => item.card),
    reviewEvents: [
      reviewEvent("learned_event", deckId, learned.card.id, "2026-08-09T08:00:00.000Z", { card: { state: "review", reps: 4 } }),
      reviewEvent("in_progress_event", deckId, inProgress.card.id, "2026-08-09T08:05:00.000Z", { card: { state: "review", reps: 4 } }),
    ],
  });
  const notes = items.map((item) => item.note);
  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      notes={notes}
      deckId={deck.id}
      getNow={() => "2026-08-09T10:00:00.000Z"}
      simulationOffsetMinutes={0}
      {...studyCallbacks(deck, notes)}
    />,
  );

  assertOpenCounts(markup, { new: 3, open: 1, due: 5 });
  assert.match(markup, /aria-valuetext="Gelernt: 1 Karte, Neu: 3 Karten, Offen: 1 Karte, Fällig: 5 Karten"/);
});

test("StudyMode uses the complete catalog projection before every card body is buffered", () => {
  const deckId = "deck_buffered_progress";
  const newItem = basicItem(deckId, "Neu", "Antwort", {
    id: "new_buffered",
    review: { state: "new", reps: 0, dueAt: "2026-08-09T09:00:00.000Z" },
  });
  const openItems = Array.from({ length: 5 }, (_value, index) => basicItem(deckId, `Offen ${index + 1}`, "Antwort", {
    id: `open_buffered_${index + 1}`,
    review: { state: "learning", reps: 1, dueAt: "2026-08-09T09:00:00.000Z" },
  }));
  const items = [newItem, ...openItems];
  const deck = createCoreDeck({ id: deckId, name: "Gepuffert", source: "manual", cards: items.map((item) => item.card) });
  const notes = items.map((item) => item.note);
  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      notes={notes}
      deckId={deck.id}
      getNow={() => "2026-08-09T10:00:00.000Z"}
      simulationOffsetMinutes={0}
      {...studyCallbacks(deck, notes)}
      sessionPlan={{
        progress: { completedTodayCount: 0, newCount: 1, inProgressCount: 5, dueCount: 1, total: 7 },
        initialCardCount: 7,
      }}
      bufferSize={5}
      hasMoreCards
      onLoadMoreCards={async () => ({ decks: [], notes: [], hasMoreCards: false, bufferSize: 5 })}
    />,
  );

  assertOpenCounts(markup, { new: 1, open: 5, due: 1 });
  assert.match(markup, /aria-valuemax="7"/);
  assert.match(markup, /aria-valuetext="Gelernt: 0 Karten, Neu: 1 Karte, Offen: 5 Karten, Fällig: 1 Karte"/);
});

test("StudyMode says Für jetzt geschafft while same-day learning steps are still waiting", () => {
  const item = basicItem("deck_waiting", "Später", "Antwort", {
    review: { state: "learning", reps: 1, dueAt: "2026-08-09T10:30:00.000Z" },
  });
  const deck = createCoreDeck({
    id: "deck_waiting",
    name: "Wartend",
    source: "manual",
    cards: [item.card],
  });
  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      notes={[item.note]}
      deckId={deck.id}
      getNow={() => "2026-08-09T10:00:00.000Z"}
      simulationOffsetMinutes={0}
      {...studyCallbacks(deck, [item.note])}
    />,
  );

  assert.match(markup, /Für jetzt geschafft/);
  assert.match(markup, /bleiben „Offen“/);
  assert.doesNotMatch(markup, /Antwort anzeigen|data-testid="study-card-content"/);
});

test("StudyMode explains when every due card is hidden by the daily limit", () => {
  const item = basicItem("deck_limited", "Begrenzt", "Antwort", {
    review: { state: "review", reps: 4, dueAt: "2026-08-09T09:00:00.000Z" },
  });
  const deck = createCoreDeck({
    id: "deck_limited",
    name: "Begrenzt",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 0 },
    cards: [item.card],
  });
  const markup = renderToStaticMarkup(
    <StudyMode
      deck={deck}
      decks={[deck]}
      notes={[item.note]}
      deckId={deck.id}
      getNow={() => "2026-08-09T10:00:00.000Z"}
      simulationOffsetMinutes={0}
      {...studyCallbacks(deck, [item.note])}
    />,
  );

  assert.match(markup, /Tageslimit erreicht/);
  assert.match(markup, /1 fällige Karte bleibt wegen deiner Tageslimits/);
  assert.doesNotMatch(markup, /Keine fälligen Karten/);
});

test("a set flag shows as a named dot in the session header (W14)", () => {
  const base = basicItem("deck_flag", "Welche Hauptstadt hat Peru?", "Lima", { review: { state: "review", repetitions: 4, maturityBand: "mature", dueAt: "2026-07-01T08:00:00.000Z" } });
  const deck = createCoreDeck({ id: "deck_flag", name: "Geografie", source: "manual", cards: [{ ...base.card, ankiFlag: 4 }], reviewEvents: [] });
  const markup = renderToStaticMarkup(
    <StudyMode deck={deck} decks={[deck]} notes={[base.note]} deckId={deck.id} getNow={() => "2026-07-06T10:00:00.000Z"} simulationOffsetMinutes={0} {...studyCallbacks(deck, [base.note])} flagNames={["", "", "", "Nachschlagen", "", "", ""]} />,
  );
  assert.match(markup, /<header[\s\S]*?role="img" aria-label="Flagge Nachschlagen"[\s\S]*?<\/header>/);
});

test("the summary side panel opens only from its header button and renders nothing before", () => {
  const base = basicItem("deck_side", "Welche Hauptstadt hat Peru?", "Lima");
  const deck = createCoreDeck({ id: "deck_side", name: "Geografie", source: "manual", cards: [base.card], reviewEvents: [] });
  const props = { deck, decks: [deck], notes: [base.note], deckId: deck.id, getNow: () => "2026-07-06T10:00:00.000Z", simulationOffsetMinutes: 0, ...studyCallbacks(deck, [base.note]) };
  const previousDocument = globalThis.document;
  globalThis.document = { documentElement: { clientWidth: 1280 } } as Document;
  let markup: string;
  try { markup = renderToStaticMarkup(<StudyMode {...props} renderSidePanel={() => <p>Fassung</p>} />); } finally { globalThis.document = previousDocument; }
  assert.match(markup, /<header[\s\S]*?<button[^>]*aria-pressed="false"[^>]*aria-label="Zusammenfassung"[\s\S]*?aria-label="Lerneinstellungen"[\s\S]*?<\/header>/);
  assert.match(markup, /<\/main><div[^>]*role="complementary"[^>]*data-testid="study-side-panel"/);
  assert.doesNotMatch(markup, /Fassung/);
  assert.doesNotMatch(renderToStaticMarkup(<StudyMode {...props} />), /aria-label="Zusammenfassung"|study-side-panel/);
});

test("a running Lerntimer sits as a pill before the header tools and replaces the old progress bar", () => {
  const item = basicItem("deck_timer", "Frage", "Antwort");
  const deck = createCoreDeck({ id: "deck_timer", name: "Welt-Hauptstädte", source: "manual", cards: [item.card], reviewEvents: [] });
  const timer = createPomodoroTimer(25, Date.now() - 7 * 60_000, "pomodoro_study");
  const markup = renderToStaticMarkup(<StudyMode deck={deck} decks={[deck]} notes={[item.note]} deckId={deck.id} getNow={() => "2026-08-06T10:00:00.000Z"} simulationOffsetMinutes={0} {...studyCallbacks(deck, [item.note])} pomodoroTimer={timer} />);
  assert.match(markup, /<div class="core-study-header-actions"><button[^>]*class="core-study-timer-pill"[^>]*aria-label="Lerntimer pausieren, noch 18 Min\."[\s\S]*?aria-label="Lerneinstellungen"/);
  assert.match(markup, /class="core-study-count-group[^"]*"><dl[^>]*data-testid="study-open-counts"/);
  assert.doesNotMatch(markup, /role="progressbar"[^>]*aria-label="Lerntimer"|study-pomodoro-progress/);
});
