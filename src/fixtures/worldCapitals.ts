import { cardStudyFromReviewState, createBasicNote, createCoreDeck, createReviewState } from "../coreModel.ts";
import { simulateRatingOutcome } from "../scheduler.ts";
import worldCapitalsSource from "../../fixtures/apkg/world-capitals.source.json" with { type: "json" };
import type { Card, Deck, Note, ReviewEvent, ReviewRating, ReviewState } from "../coreTypes.ts";
import type { ImportCommitGraph } from "../apkgImport.ts";

type WorldCapitalItem = (typeof worldCapitalsSource.items)[number];

interface WorldCapitalContinent {
  id: string;
  label: string;
  deckId: string;
  cards: WorldCapitalItem[];
}

function createWorldCapitalsFixture(source: typeof worldCapitalsSource) {
  const continentsById = new Map<string, WorldCapitalContinent>();

  for (const item of source.items ?? []) {
    if (!continentsById.has(item.continentId)) {
      continentsById.set(item.continentId, {
        id: item.continentId,
        label: item.continent,
        deckId: `deck_world_capitals_${item.continentId}`,
        cards: [],
      });
    }

    continentsById.get(item.continentId)!.cards.push(item);
  }

  return {
    metadata: source.metadata,
    rootDeck: {
      id: "deck_world_capitals",
      name: source.metadata.title,
    },
    continents: [...continentsById.values()],
  };
}

export const WORLD_CAPITALS_FIXTURE = createWorldCapitalsFixture(worldCapitalsSource);
export const WORLD_CAPITALS_TOTAL_CARDS = WORLD_CAPITALS_FIXTURE.metadata.totalCards;
export const WORLD_CAPITALS_COUNTS_BY_CONTINENT = WORLD_CAPITALS_FIXTURE.metadata.countsByContinent;

export const WORLD_CAPITALS_STUDY_HISTORY = {
  fixture: "world-capitals",
  version: "study-history-v1",
  startedAt: "2026-04-07T07:00:00.000Z",
  endedAt: "2026-07-07T07:00:00.000Z",
  description: "Dreimonatige, fleißige lokale Lernhistorie für realistische Dashboard-, Heatmap- und Review-Tests.",
};

const HISTORY_DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_TOTAL_DAYS = 92;
const HISTORY_DECK_CREATED_AT = "2026-04-07T06:30:00.000Z";
const HISTORY_DECK_UPDATED_AT = "2026-07-07T07:00:00.000Z";
const HISTORY_START_TIME = new Date(WORLD_CAPITALS_STUDY_HISTORY.startedAt).getTime();
const HISTORY_END_TIME = new Date(WORLD_CAPITALS_STUDY_HISTORY.endedAt).getTime();

interface StudyProfile {
  label: string;
  offsets: number[];
  ratings: ReviewRating[];
  maturityXp(index: number): number;
  stability(index: number): number;
  difficulty(index: number): number;
  intervalDays(index: number): number;
  dueOffsetDays(index: number): number;
  preferredVariantLevel: number;
  lapses?: (index: number) => number;
  retrievability: number;
}

const STUDY_PROFILES = {
  mastered: {
    label: "sicher",
    offsets: [0, 0, 1, 3, 7, 14, 25, 40, 61, 82],
    ratings: ["good", "easy", "good", "easy", "good", "easy", "good", "easy", "good", "easy"],
    maturityXp: (index: number) => 190 + (index % 24),
    stability: (index: number) => 42 + (index % 14),
    difficulty: (index: number) => 2.1 + (index % 6) / 10,
    intervalDays: (index: number) => 34 + (index % 24),
    dueOffsetDays: (index: number) => 30 + (index % 26),
    preferredVariantLevel: 3,
    retrievability: 0.97,
  },
  variantReady: {
    label: "core-ready",
    offsets: [0, 0, 1, 4, 10, 21, 39, 66],
    ratings: ["good", "good", "hard", "good", "easy", "good", "good", "easy"],
    maturityXp: (index: number) => 132 + (index % 42),
    stability: (index: number) => 16 + (index % 16),
    difficulty: (index: number) => 3.8 + (index % 12) / 10,
    intervalDays: (index: number) => 14 + (index % 14),
    dueOffsetDays: (index: number) => 8 + (index % 18),
    preferredVariantLevel: 2,
    retrievability: 0.91,
  },
  stubbornMature: {
    label: "hartnäckig-aber-stabil",
    offsets: [0, 0, 1, 2, 5, 9, 15, 24, 38, 57, 78],
    ratings: ["again", "good", "hard", "good", "again", "good", "hard", "good", "easy", "good", "good"],
    maturityXp: (index: number) => 128 + (index % 36),
    stability: (index: number) => 12 + (index % 18),
    difficulty: (index: number) => 6.4 + (index % 14) / 10,
    intervalDays: (index: number) => 10 + (index % 10),
    dueOffsetDays: (index: number) => 4 + (index % 12),
    preferredVariantLevel: 2,
    lapses: (index: number) => 2 + (index % 2),
    retrievability: 0.84,
  },
  dueStable: {
    label: "fällig-stabil",
    offsets: [0, 0, 1, 4, 9, 20, 41, 70, 89],
    ratings: ["good", "hard", "good", "good", "hard", "good", "good", "hard", "good"],
    maturityXp: (index: number) => 122 + (index % 34),
    stability: (index: number) => 8 + (index % 12),
    difficulty: (index: number) => 5.0 + (index % 14) / 10,
    intervalDays: (index: number) => 7 + (index % 8),
    dueOffsetDays: (index: number) => -1 - (index % 4),
    preferredVariantLevel: 2,
    retrievability: 0.68,
  },
  steadyYoung: {
    label: "jung-stetig",
    offsets: [0, 0, 1, 5, 12, 28, 55],
    ratings: ["good", "good", "good", "hard", "good", "good", "easy"],
    maturityXp: (index: number) => 82 + (index % 42),
    stability: (index: number) => 5 + (index % 10),
    difficulty: (index: number) => 4.5 + (index % 12) / 10,
    intervalDays: (index: number) => 5 + (index % 7),
    dueOffsetDays: (index: number) => 3 + (index % 11),
    preferredVariantLevel: 1,
    retrievability: 0.86,
  },
} satisfies Record<string, StudyProfile>;

function addDaysIso(baseTime: number, days: number, minuteOffset = 0) {
  return new Date(baseTime + days * HISTORY_DAY_MS + minuteOffset * 60 * 1000).toISOString();
}

function studyTimestamp(dayOffset: number, cardIndex: number, eventIndex: number) {
  const minuteOffset = 45 + (cardIndex % 9) * 11 + eventIndex * 3;
  return addDaysIso(HISTORY_START_TIME, dayOffset, minuteOffset);
}

function dueTimestamp(profile: StudyProfile, cardIndex: number) {
  return addDaysIso(HISTORY_END_TIME, profile.dueOffsetDays(cardIndex), 90 + (cardIndex % 30));
}

function isRestDay(dayOffset: number) {
  return dayOffset > 0 && (dayOffset % 11 === 6 || dayOffset % 29 === 20);
}

function adjustStudyDay(dayOffset: number) {
  let nextDay = Math.min(HISTORY_TOTAL_DAYS - 1, Math.max(0, dayOffset));
  while (isRestDay(nextDay) && nextDay < HISTORY_TOTAL_DAYS - 1) {
    nextDay += 1;
  }
  return nextDay;
}

function selectStudyProfile(cardIndex: number) {
  if (cardIndex % 13 === 0) return STUDY_PROFILES.stubbornMature;
  if (cardIndex % 5 === 0) return STUDY_PROFILES.mastered;
  if (cardIndex % 7 === 0) return STUDY_PROFILES.dueStable;
  if (cardIndex % 3 === 0) return STUDY_PROFILES.variantReady;
  return STUDY_PROFILES.steadyYoung;
}

function responseTimeFor(profile: StudyProfile, cardIndex: number, eventIndex: number, rating: ReviewRating) {
  const profileBase = profile === STUDY_PROFILES.stubbornMature ? 9200 : profile === STUDY_PROFILES.mastered ? 2600 : 4800;
  const ratingPenalty = rating === "again" ? 4200 : rating === "hard" ? 2300 : rating === "easy" ? -700 : 0;
  return Math.max(1600, profileBase + ratingPenalty + (cardIndex % 8) * 370 + eventIndex * 95);
}

function createHistoryEvent({ deckId, card, eventIndex, rating, reviewedAt, previousState, nextState, profile, cardIndex }: {
  deckId: string;
  card: Card;
  eventIndex: number;
  rating: ReviewRating;
  reviewedAt: string;
  previousState: ReviewState;
  nextState: ReviewState;
  profile: StudyProfile;
  cardIndex: number;
}): ReviewEvent {
  const snapshot = (state: ReviewState) => ({ card: { state: state.state, dueAt: state.dueAt, intervalDays: state.intervalDays, stability: state.stability, difficulty: state.difficulty, reps: state.reps, lapses: state.lapses } });
  return {
    id: `review_world_capitals_${card.id.replace(/^card_world_capitals_/, "")}_${String(eventIndex + 1).padStart(2, "0")}`,
    userId: "local-user",
    deckId,
    cardId: card.id,
    variantId: null,
    rating,
    answeredAt: reviewedAt,
    responseTimeMs: responseTimeFor(profile, cardIndex, eventIndex, rating),
    schedulerBefore: snapshot(previousState),
    schedulerAfter: snapshot(nextState),
    flags: {
      fixture: "world-capitals",
      studyHistoryVersion: WORLD_CAPITALS_STUDY_HISTORY.version,
      studyProfile: profile.label,
    },
    createdAt: reviewedAt,
  };
}

function createFinalReviewState({ profile, cardIndex, eventCount, firstReviewedAt, lastReviewedAt, rollingState }: {
  profile: StudyProfile;
  cardIndex: number;
  eventCount: number;
  firstReviewedAt: string;
  lastReviewedAt: string;
  rollingState: ReviewState;
}) {
  return createReviewState({
    ...rollingState,
    state: "review",
    dueAt: dueTimestamp(profile, cardIndex),
    intervalDays: profile.intervalDays(cardIndex),
    intervalMinutes: null,
    difficulty: profile.difficulty(cardIndex),
    stability: profile.stability(cardIndex),
    desiredRetention: 0.9,
    reps: eventCount,
    lapses: typeof profile.lapses === "function" ? profile.lapses(cardIndex) : 0,
    maturityXp: profile.maturityXp(cardIndex),
    lastReviewedAt,
    lastRating: "good",
    preferredVariantLevel: profile.preferredVariantLevel,
    forcedVariantId: null,
    fallbackUntilCorrect: false,
    lastFailedVariantId: null,
    firstLearningAt: firstReviewedAt,
    lastLearningStepAt: firstReviewedAt,
    graduatedAt: rollingState.graduatedAt ?? firstReviewedAt,
    isGraduated: true,
    learningDayKey: null,
  });
}

function withStudyHistory(deckId: string, card: Card, cardIndex: number, continentIndex: number) {
  const profile = selectStudyProfile(cardIndex);
  const introDay = Math.min(30, Math.floor(cardIndex / 9) + (continentIndex % 3));
  let rollingState = createReviewState({ state: "new", dueAt: addDaysIso(HISTORY_START_TIME, introDay), reps: 0, maturityXp: 0 });
  const events: ReviewEvent[] = [];

  profile.ratings.forEach((rating, eventIndex) => {
    const plannedDay = introDay + (profile.offsets[eventIndex] ?? profile.offsets.at(-1) ?? 0);
    if (plannedDay > HISTORY_TOTAL_DAYS - 1) return;
    const reviewedAt = studyTimestamp(adjustStudyDay(plannedDay), cardIndex, eventIndex);
    const previousState = rollingState;
    rollingState = simulateRatingOutcome({ previousState, variant: null, rating, now: reviewedAt }).nextReviewState;
    events.push(createHistoryEvent({ deckId, card, eventIndex, rating, reviewedAt, previousState, nextState: rollingState, profile, cardIndex }));
  });

  const firstReviewedAt = events[0]?.answeredAt ?? addDaysIso(HISTORY_START_TIME, introDay);
  const lastReviewedAt = events.at(-1)?.answeredAt ?? firstReviewedAt;
  const study = cardStudyFromReviewState(createFinalReviewState({ profile, cardIndex, eventCount: events.length, firstReviewedAt, lastReviewedAt, rollingState }));
  return {
    card: { ...card, study, studyRevision: events.length, updatedAt: HISTORY_DECK_UPDATED_AT },
    events,
  };
}

function createCapitalNote(deckId: string, item: WorldCapitalItem) {
  const front = `Was ist die Hauptstadt von ${item.country}?`;
  const back = item.capitals.length === 1 ? item.capitals[0] : `Hauptstädte: ${item.capitals.join(", ")}`;
  const created = createBasicNote(deckId, front, back, {
    tags: ["geo", "hauptstaedte", item.continentId, String(item.cca3).toLowerCase()],
    createdAt: HISTORY_DECK_CREATED_AT,
  });
  const note: Note = {
    ...created.note,
    id: item.id.replace(/^card_/, "note_"),
    source: "anki-apkg",
    ankiGuid: String(item.ankiNoteId),
    importedContentRevision: 1,
  };
  const card: Card = { ...created.cards[0], id: item.id, noteId: note.id, ankiCardId: String(item.ankiCardId) };
  return { note, card };
}

/** Demo and E2E seed: the world capitals tree with notes, cards and a three-month study history. */
export function createWorldCapitalsSeed(): { decks: Deck[]; notes: Note[] } {
  const rootDeck = createCoreDeck({
    id: WORLD_CAPITALS_FIXTURE.rootDeck.id,
    name: WORLD_CAPITALS_FIXTURE.rootDeck.name,
    source: "anki-apkg",
    parentDeckId: null,
    hierarchyPath: [WORLD_CAPITALS_FIXTURE.rootDeck.name],
    ankiDeckId: "world-capitals-root",
    createdAt: HISTORY_DECK_CREATED_AT,
    updatedAt: HISTORY_DECK_UPDATED_AT,
  });
  const notes: Note[] = [];
  let cardIndex = 0;
  const childDecks = WORLD_CAPITALS_FIXTURE.continents.map((continent, continentIndex) => {
    const cards: Card[] = [];
    const reviewEvents: ReviewEvent[] = [];
    for (const item of continent.cards) {
      const { note, card } = createCapitalNote(continent.deckId, item);
      const history = withStudyHistory(continent.deckId, card, cardIndex, continentIndex);
      notes.push(note);
      cards.push(history.card);
      reviewEvents.push(...history.events);
      cardIndex += 1;
    }
    return createCoreDeck({
      id: continent.deckId,
      name: continent.label,
      source: "anki-apkg",
      parentDeckId: rootDeck.id,
      hierarchyPath: [rootDeck.name, continent.label],
      ankiDeckId: `world-capitals-${continent.id}`,
      cards,
      reviewEvents,
      createdAt: HISTORY_DECK_CREATED_AT,
      updatedAt: HISTORY_DECK_UPDATED_AT,
    });
  });
  return { decks: [rootDeck, ...childDecks], notes };
}

/** The seed as an import graph, so the demo takes the same chunked commit as an Anki package. */
export function createWorldCapitalsImportGraph(): ImportCommitGraph {
  const { decks, notes } = createWorldCapitalsSeed();
  const cards = decks.flatMap((deck) => deck.cards);
  const reviews = decks.flatMap((deck) => deck.reviewEvents.flatMap((event) => event.rating === "manual" ? [] : [{
    id: event.id,
    cardId: event.cardId,
    rating: event.rating,
    answeredAt: event.answeredAt,
    responseTimeMs: event.responseTimeMs,
    schedulerBefore: event.schedulerBefore,
    schedulerAfter: event.schedulerAfter,
    flags: event.flags,
  }]));
  return {
    deckCount: decks.length,
    noteCount: notes.length,
    cardCount: cards.length,
    reviewEventCount: reviews.length,
    mediaCount: 0,
    ankiGuids: notes.flatMap((note) => note.ankiGuid ? [note.ankiGuid] : []),
    async streamChunks(visit) {
      await visit({ kind: "decks", decks: decks.map(({ id, ankiDeckId, name, hierarchyPath, parentDeckId }) => ({ id, ankiDeckId, name, hierarchyPath, parentDeckId })) });
      await visit({ kind: "notes", notes, noteSources: [], cards });
      await visit({ kind: "reviews", values: reviews });
    },
    dispose() {},
  };
}
