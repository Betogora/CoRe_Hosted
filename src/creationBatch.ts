import type { CardType } from "./coreTypes.ts";

export type ManualPinnedField = "front" | "back";
export type ManualFocusTarget = ManualPinnedField | "option-0";

export interface ManualCreationDraft {
  cardType: CardType;
  front: string;
  back: string;
  answerOptions: string[];
  correctOptionIndices: number[];
  tags: string;
  selection: string;
}

export interface ManualBatchSessionState {
  createdCount: number;
  targetDeckId: string;
  currentDraft: ManualCreationDraft;
  pinnedFields: Record<ManualPinnedField, boolean>;
  lastSavedCardId: string | null;
}

export type ManualBatchAction =
  | { type: "draft"; patch: Partial<ManualCreationDraft> }
  | { type: "target-deck"; deckId: string }
  | { type: "toggle-pin"; field: ManualPinnedField }
  | { type: "saved"; cardId: string; targetDeckId: string };

export function createManualDraft(cardType: CardType = "basic"): ManualCreationDraft {
  return {
    cardType,
    front: "",
    back: "",
    answerOptions: ["", ""],
    correctOptionIndices: [0],
    tags: "",
    selection: "",
  };
}

export function createManualBatchSession(targetDeckId = ""): ManualBatchSessionState {
  return {
    createdCount: 0,
    targetDeckId,
    currentDraft: createManualDraft(),
    pinnedFields: { front: false, back: false },
    lastSavedCardId: null,
  };
}

export function resetManualDraft(
  draft: ManualCreationDraft,
  pinnedFields: ManualBatchSessionState["pinnedFields"],
): ManualCreationDraft {
  return {
    ...draft,
    front: pinnedFields.front ? draft.front : "",
    back: pinnedFields.back ? draft.back : "",
    answerOptions: ["", ""],
    correctOptionIndices: [0],
    tags: "",
    selection: "",
  };
}

export function reduceManualBatchSession(
  state: ManualBatchSessionState,
  action: ManualBatchAction,
): ManualBatchSessionState {
  if (action.type === "draft") {
    return { ...state, currentDraft: { ...state.currentDraft, ...action.patch } };
  }
  if (action.type === "target-deck") {
    return { ...state, targetDeckId: action.deckId };
  }
  if (action.type === "toggle-pin") {
    return {
      ...state,
      pinnedFields: { ...state.pinnedFields, [action.field]: !state.pinnedFields[action.field] },
    };
  }
  return {
    ...state,
    createdCount: state.createdCount + 1,
    targetDeckId: action.targetDeckId,
    currentDraft: resetManualDraft(state.currentDraft, state.pinnedFields),
    lastSavedCardId: action.cardId,
  };
}

export function manualDraftsEqual(left: ManualCreationDraft, right: ManualCreationDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function nextManualFocusTarget(state: ManualBatchSessionState): ManualFocusTarget {
  if (!state.pinnedFields.front) return "front";
  if (!state.pinnedFields.back) return "back";
  if (state.currentDraft.cardType === "single-choice" || state.currentDraft.cardType === "multiple-choice") return "option-0";
  return "front";
}
