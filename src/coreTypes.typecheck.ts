import type { CardVariant, LearningItem, LearningItemCreationInput, ReviewRating, ReviewSchedulerState, ReviewState, SyncStatus } from "./coreTypes.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type VariantHasNoSchedule = Assert<Equal<Extract<keyof CardVariant, "reviewState" | "dueAt">, never>>;
type CardOwnsReviewState = Assert<Equal<LearningItem["reviewState"], ReviewState>>;
type Ratings = Assert<Equal<ReviewRating, "again" | "hard" | "good" | "easy">>;
type Phases = Assert<Equal<ReviewSchedulerState, "new" | "learning" | "review" | "relearning">>;
type SyncStates = Assert<Equal<SyncStatus["status"], "idle" | "pending" | "offline" | "saving" | "saved" | "error" | "conflict">>;

const creationInputs = [
  { cardType: "basic", deckId: "deck", front: "Frage", back: "Antwort" },
  { cardType: "basic-with-images", deckId: "deck", front: "Frage", back: "Antwort", mediaRefs: ["bild"] },
  { cardType: "basic-reversed", deckId: "deck", front: "Frage", back: "Antwort" },
  { cardType: "cloze", deckId: "deck", textWithClozes: "{{c1::Antwort}}" },
  { cardType: "single-choice", deckId: "deck", front: "Frage", back: "B", answerOptions: ["A", "B"], correctAnswer: "B" },
  { cardType: "multiple-choice", deckId: "deck", front: "Frage", back: "A und B", answerOptions: ["A", "B", "C"], correctAnswers: ["A", "B"] },
] satisfies LearningItemCreationInput[];

type CreationTypes = Assert<Equal<(typeof creationInputs)[number]["cardType"], LearningItemCreationInput["cardType"]>>;
