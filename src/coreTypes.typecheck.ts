import type { Card, CardStudyState, CardVariant, Deck, Note, NoteContent, ReviewRating, ReviewSchedulerState, ReviewState, SyncStatus } from "./coreTypes.ts";
import type { ManualContentKind } from "./coreModel.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type VariantHasNoSchedule = Assert<Equal<Extract<keyof CardVariant, "reviewState" | "dueAt">, never>>;
type DeckHoldsCards = Assert<Equal<Deck["cards"], Card[]>>;
type FlatViewKeepsExtras = Assert<Equal<ReviewState["maturityBand"], CardStudyState["extra"]["maturityBand"]>>;
type NoteOwnsContent = Assert<Equal<Note["content"], NoteContent>>;
type NoteHasNoDeckOrSchedule = Assert<Equal<Extract<keyof Note, "deckId" | "study" | "reviewState" | "variants">, never>>;
type NoteOwnsMarking = Assert<Equal<Note["marked"], boolean>>;
type NewCardOwnsStudy = Assert<Equal<Card["study"], CardStudyState>>;
type NewCardHasNoContentCopy = Assert<Equal<Extract<keyof Card, "content" | "front" | "back" | "tags" | "marked" | "reviewState">, never>>;
type CardStatuses = Assert<Equal<Card["status"], "active" | "suspended">>;
type StudyPhases = Assert<Equal<CardStudyState["state"], ReviewSchedulerState>>;
type StudyHasNoLegacyIdentity = Assert<Equal<Extract<keyof CardStudyState, "id" | "learningItemId" | "reviewableId" | "userId" | "repetitions">, never>>;
type StudyExtrasAreTyped = Assert<Equal<CardStudyState["extra"]["maturityBand"], ReviewState["maturityBand"]>>;
type Ratings = Assert<Equal<ReviewRating, "again" | "hard" | "good" | "easy">>;
type Phases = Assert<Equal<ReviewSchedulerState, "new" | "learning" | "review" | "relearning">>;
type SyncStates = Assert<Equal<SyncStatus["status"], "idle" | "pending" | "offline" | "saving" | "saved" | "error" | "conflict">>;

type ManualKinds = Assert<Equal<ManualContentKind, "basic" | "basic-reversed" | "cloze" | "single-choice" | "multiple-choice">>;
