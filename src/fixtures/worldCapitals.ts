import { createBasicLearningItem, createCoreDeck, createReviewState, getOriginalVariant, normalizeLearningItem } from "../coreModel.ts";
import { simulateRatingOutcome } from "../scheduler.ts";
import worldCapitalsSource from "../../fixtures/apkg/world-capitals.source.json" with { type: "json" };
import type { CardVariant, Deck, LearningItem, ReviewEvent, ReviewRating, ReviewState } from "../coreTypes.ts";

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

function compactHistoryReviewState(state: Partial<ReviewState> = {}) {
  return {
    state: state.state ?? "new",
    reps: Number(state.reps ?? state.repetitions ?? 0),
    repetitions: Number(state.repetitions ?? state.reps ?? 0),
    lapses: Number(state.lapses ?? 0),
  };
}

function createHistoryEvent({ deckId, item, variant, eventIndex, rating, reviewedAt, previousState, nextState, profile, cardIndex }: {
  deckId: string;
  item: LearningItem;
  variant: CardVariant;
  eventIndex: number;
  rating: ReviewRating;
  reviewedAt: string;
  previousState: ReviewState;
  nextState: ReviewState;
  profile: StudyProfile;
  cardIndex: number;
}): ReviewEvent & { reviewedAt: string; cardId: string; cardVariantId: string; [key: string]: unknown } {
  return {
    id: `review_world_capitals_${item.id.replace(/^card_world_capitals_/, "")}_${String(eventIndex + 1).padStart(2, "0")}`,
    userId: "local-user",
    deckId,
    learningItemId: item.id,
    cardId: item.id,
    cardVariantId: variant.id,
    variantId: variant.id,
    reviewableType: "card" as const,
    reviewableId: variant.id,
    sourceCardId: item.id,
    rating,
    reviewedAt,
    answeredAt: reviewedAt,
    responseTimeMs: responseTimeFor(profile, cardIndex, eventIndex, rating),
    schedulerBefore: previousState,
    schedulerAfter: nextState,
    variantLevel: 1,
    variantType: "basic",
    previousLearningItemStateJson: compactHistoryReviewState(previousState),
    nextLearningItemStateJson: compactHistoryReviewState(nextState),
    schedulerVersion: nextState.schedulerVersion ?? "fsrs_v1",
    schedulerParamsJson: nextState.schedulerParamsJson ?? null,
    anchorVariantId: null,
    anchorSnapshotJson: null,
    fallbackInfo: rating === "again" ? { fixtureFallback: "Originalkarte wurde erneut geübt." } : null,
    flags: {
      fixture: "world-capitals",
      studyHistoryVersion: WORLD_CAPITALS_STUDY_HISTORY.version,
      studyProfile: profile.label,
    },
    createdAt: reviewedAt,
  };
}

function createFinalReviewState({ profile, cardIndex, eventCount, firstReviewedAt, lastReviewedAt, rollingState, item }: any) {
  return createReviewState({
    ...rollingState,
    learningItemId: item.id,
    reviewableType: "card",
    reviewableId: item.id,
    state: "review",
    dueAt: dueTimestamp(profile, cardIndex),
    intervalDays: profile.intervalDays(cardIndex),
    intervalMinutes: null,
    ease: Math.max(1.3, 2.5 - (profile.difficulty(cardIndex) - 5) * 0.08),
    difficulty: profile.difficulty(cardIndex),
    stability: profile.stability(cardIndex),
    desiredRetention: 0.9,
    retrievability: profile.retrievability,
    reps: eventCount,
    repetitions: eventCount,
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
    schedulerParamsJson: {
      schedulerVersion: "fsrs_v1",
      schedulerKind: "world_capitals_fixture_history",
      studyProfile: profile.label,
      studyHistoryVersion: WORLD_CAPITALS_STUDY_HISTORY.version,
    },
  });
}

function createCardStudyHistory(deckId: string, card: LearningItem, cardIndex: number, continentIndex: number) {
  const item = normalizeLearningItem(card);
  const variant = getOriginalVariant(item);
  if (!variant) throw new Error(`Originalvariante für ${item.id} fehlt.`);
  const profile = selectStudyProfile(cardIndex);
  const introDay = Math.min(30, Math.floor(cardIndex / 9) + (continentIndex % 3));
  let rollingState = createReviewState({
    learningItemId: item.id,
    reviewableType: "card",
    reviewableId: item.id,
    state: "new",
    dueAt: addDaysIso(HISTORY_START_TIME, introDay),
    reps: 0,
    repetitions: 0,
    maturityXp: 0,
  });
  const events: Array<ReturnType<typeof createHistoryEvent>> = [];

  profile.ratings.forEach((rating, eventIndex) => {
    const plannedDay = introDay + (profile.offsets[eventIndex] ?? profile.offsets.at(-1) ?? 0);
    if (plannedDay > HISTORY_TOTAL_DAYS - 1) return;

    const reviewedAt = studyTimestamp(adjustStudyDay(plannedDay), cardIndex, eventIndex);
    const previousState = rollingState;
    const outcome = simulateRatingOutcome({
      learningItem: item,
      previousState,
      variant,
      rating,
      now: reviewedAt,
    });
    rollingState = outcome.nextReviewState;
    events.push(
      createHistoryEvent({
        deckId,
        item,
        variant,
        eventIndex,
        rating,
        reviewedAt,
        previousState,
        nextState: rollingState,
        profile,
        cardIndex,
      }),
    );
  });

  const firstReviewedAt = events[0]?.reviewedAt ?? addDaysIso(HISTORY_START_TIME, introDay);
  const lastReviewedAt = events.at(-1)?.reviewedAt ?? firstReviewedAt;
  const reviewState = createFinalReviewState({
    profile,
    cardIndex,
    eventCount: events.length,
    firstReviewedAt,
    lastReviewedAt,
    rollingState,
    item,
  });

  return {
    card: normalizeLearningItem({
      ...item,
      learningItemState: reviewState,
      reviewState,
      createdAt: HISTORY_DECK_CREATED_AT,
      updatedAt: HISTORY_DECK_UPDATED_AT,
      meta: {
        ...(item.meta ?? {}),
        studyProfile: profile.label,
        studyHistoryVersion: WORLD_CAPITALS_STUDY_HISTORY.version,
        introducedAt: firstReviewedAt,
      },
    }),
    events,
  };
}

function createStudyHistoryMaps(decks: Deck[] = []) {
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const cardsById = new Map<string, LearningItem>();
  const eventsByDeckId = new Map<string, Array<ReturnType<typeof createHistoryEvent>>>();
  let cardIndex = 0;

  WORLD_CAPITALS_FIXTURE.continents.forEach((continent, continentIndex) => {
    const deck = deckById.get(continent.deckId);
    const existingCardsById = new Map((deck?.cards ?? []).map((card) => [card.id, card]));

    continent.cards.forEach((fixtureItem) => {
      const baseCard = existingCardsById.get(fixtureItem.id);
      if (!baseCard) {
        cardIndex += 1;
        return;
      }

      const history = createCardStudyHistory(continent.deckId, baseCard, cardIndex, continentIndex);
      cardsById.set(fixtureItem.id, history.card);
      eventsByDeckId.set(continent.deckId, [...(eventsByDeckId.get(continent.deckId) ?? []), ...history.events]);
      cardIndex += 1;
    });
  });

  return { cardsById, eventsByDeckId };
}

function isWorldCapitalsDeck(deck: Deck) {
  return deck?.id === WORLD_CAPITALS_FIXTURE.rootDeck.id || WORLD_CAPITALS_FIXTURE.continents.some((continent) => continent.deckId === deck?.id);
}

function hasWorldCapitalsStudyHistory(decks: Deck[] = []) {
  return decks.some((deck) => {
    const studyHistory = deck.importMeta?.studyHistory;
    return isWorldCapitalsDeck(deck) && studyHistory != null && typeof studyHistory === "object" && "version" in studyHistory && studyHistory.version === WORLD_CAPITALS_STUDY_HISTORY.version;
  });
}

function hasUserWorldCapitalsProgress(decks: Deck[] = []) {
  return decks
    .filter(isWorldCapitalsDeck)
    .some(
      (deck) =>
        (deck.reviewEvents ?? []).length > 0 ||
        (deck.cards ?? []).some((card: { reviewState: { repetitions: any; reps: any; lastReviewedAt: any; }; }) => Number(card.reviewState?.repetitions ?? card.reviewState?.reps ?? 0) > 0 || Boolean(card.reviewState?.lastReviewedAt)),
    );
}

function hasWorldCapitalsSeed(decks: Deck[] = []) {
  const ids = new Set(decks.map((deck) => deck.id));
  return ids.has(WORLD_CAPITALS_FIXTURE.rootDeck.id) && WORLD_CAPITALS_FIXTURE.continents.every((continent) => ids.has(continent.deckId));
}

function withStudyHistoryMeta(importMeta: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    ...(importMeta ?? {}),
    studyHistory: {
      ...WORLD_CAPITALS_STUDY_HISTORY,
      ...extra,
    },
  };
}

function createCapitalCard(deckId: string, item: WorldCapitalItem) {
  const front = `Was ist die Hauptstadt von ${item.country}?`;
  const back = item.capitals.length === 1 ? item.capitals[0] : `Hauptstädte: ${item.capitals.join(", ")}`;

  return createBasicLearningItem(deckId, front, back, {
    id: item.id,
    originalVariantId: item.variantId,
    source: "anki-apkg",
    sourceType: "anki_import",
    sourceRefId: `anki-note-${item.ankiNoteId}`,
    tags: ["geo", "hauptstaedte", item.continentId, String(item.cca3).toLowerCase()],
    createdAt: HISTORY_DECK_CREATED_AT,
    updatedAt: HISTORY_DECK_CREATED_AT,
    reviewState: {
      learningItemId: item.id,
      reviewableType: "card",
      reviewableId: item.id,
      dueAt: "2026-07-07T00:00:00.000Z",
      reps: 0,
      repetitions: 0,
      maturityXp: 0,
    },
    meta: {
      fixture: "world-capitals",
      source: WORLD_CAPITALS_FIXTURE.metadata.source,
      sourceLicense: WORLD_CAPITALS_FIXTURE.metadata.sourceLicense,
      sourceUrl: WORLD_CAPITALS_FIXTURE.metadata.sourceUrl,
      snapshotDate: WORLD_CAPITALS_FIXTURE.metadata.snapshotDate,
      countryCode: item.cca3,
      countryCodeAlpha2: item.cca2,
      countryEnglish: item.countryEnglish,
      continent: item.continent,
      ankiNoteId: String(item.ankiNoteId),
      ankiCardId: String(item.ankiCardId),
    },
  });
}

export function applyWorldCapitalsStudyHistory(decks: Deck[] = []): Deck[] {
  const history = createStudyHistoryMaps(decks);
  const totalReviewEvents = [...history.eventsByDeckId.values()].reduce((sum, events) => sum + events.length, 0);

  return decks.map((deck) => {
    if (!isWorldCapitalsDeck(deck)) return deck;

    const isRoot = deck.id === WORLD_CAPITALS_FIXTURE.rootDeck.id;
    const nextCards = isRoot ? [] : (deck.cards ?? []).map((card: { id: any; }) => history.cardsById.get(card.id) ?? card);
    const reviewEvents = isRoot ? [] : history.eventsByDeckId.get(deck.id) ?? [];

    return createCoreDeck({
      ...deck,
      cards: nextCards,
      reviewEvents,
      createdAt: HISTORY_DECK_CREATED_AT,
      updatedAt: HISTORY_DECK_UPDATED_AT,
      importMeta: withStudyHistoryMeta(deck.importMeta, {
        totalReviewEvents: isRoot ? totalReviewEvents : reviewEvents.length,
        activeDays: HISTORY_TOTAL_DAYS,
      }),
    });
  });
}

export function ensureWorldCapitalsStudyHistory(decks: Deck[] = []): Deck[] {
  if (!hasWorldCapitalsSeed(decks) || hasWorldCapitalsStudyHistory(decks) || hasUserWorldCapitalsProgress(decks)) {
    return decks;
  }

  return applyWorldCapitalsStudyHistory(decks);
}

export function createWorldCapitalsSeedDecks() {
  const rootDeck = createCoreDeck({
    id: WORLD_CAPITALS_FIXTURE.rootDeck.id,
    name: WORLD_CAPITALS_FIXTURE.rootDeck.name,
    source: "anki-apkg",
    parentDeckId: null,
    hierarchyPath: [WORLD_CAPITALS_FIXTURE.rootDeck.name],
    originalDeckId: "world-capitals-root",
    cards: [],
    tags: ["geo", "hauptstaedte"],
    createdAt: HISTORY_DECK_CREATED_AT,
    updatedAt: HISTORY_DECK_CREATED_AT,
    importMeta: {
      fixture: "world-capitals",
      fileName: "world-capitals.apkg",
      source: WORLD_CAPITALS_FIXTURE.metadata.source,
      sourceUrl: WORLD_CAPITALS_FIXTURE.metadata.sourceUrl,
      sourceLicense: WORLD_CAPITALS_FIXTURE.metadata.sourceLicense,
      snapshotDate: WORLD_CAPITALS_FIXTURE.metadata.snapshotDate,
      detectedCards: WORLD_CAPITALS_FIXTURE.metadata.totalCards,
      detectedDecks: WORLD_CAPITALS_FIXTURE.continents.length + 1,
      isContainerDeck: true,
    },
  });

  const childDecks = WORLD_CAPITALS_FIXTURE.continents.map((continent) =>
    createCoreDeck({
      id: continent.deckId,
      name: continent.label,
      source: "anki-apkg",
      parentDeckId: rootDeck.id,
      hierarchyPath: [rootDeck.name, continent.label],
      originalDeckId: `world-capitals-${continent.id}`,
      cards: continent.cards.map((item: any) => createCapitalCard(continent.deckId, item)),
      tags: ["geo", "hauptstaedte", continent.id],
      createdAt: HISTORY_DECK_CREATED_AT,
      updatedAt: HISTORY_DECK_CREATED_AT,
      importMeta: {
        fixture: "world-capitals",
        fileName: "world-capitals.apkg",
        source: WORLD_CAPITALS_FIXTURE.metadata.source,
        sourceUrl: WORLD_CAPITALS_FIXTURE.metadata.sourceUrl,
        sourceLicense: WORLD_CAPITALS_FIXTURE.metadata.sourceLicense,
        snapshotDate: WORLD_CAPITALS_FIXTURE.metadata.snapshotDate,
        ankiDeckPath: `${rootDeck.name}::${continent.label}`,
        detectedCards: continent.cards.length,
        isContainerDeck: false,
      },
    }),
  );

  return applyWorldCapitalsStudyHistory([rootDeck, ...childDecks]);
}
