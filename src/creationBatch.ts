import type { ManualContentKind } from "./coreModel.ts";

type ManualPinnedField = "front" | "back";
export type ManualFocusTarget = ManualPinnedField | "option-0";

interface ManualCreationDraft {
  kind: ManualContentKind;
  front: string;
  back: string;
  answerOptions: string[];
  correctOptionIndices: number[];
  tags: string[];
}

interface ManualBatchSessionState {
  createdCount: number;
  targetDeckId: string;
  currentDraft: ManualCreationDraft;
  pinnedFields: Record<ManualPinnedField, boolean>;
}

type ManualBatchAction =
  | { type: "draft"; patch: Partial<ManualCreationDraft> }
  | { type: "target-deck"; deckId: string }
  | { type: "toggle-pin"; field: ManualPinnedField }
  | { type: "saved"; targetDeckId: string }
  | { type: "discard" };

const EMPTY_ANSWER_OPTIONS = ["", "", ""];

function defaultCorrectOptions(kind: ManualContentKind) {
  return kind === "single-choice" ? [1] : kind === "multiple-choice" ? [0, 1] : [0];
}

function createManualDraft(kind: ManualContentKind = "basic"): ManualCreationDraft {
  return {
    kind,
    front: "",
    back: "",
    answerOptions: EMPTY_ANSWER_OPTIONS,
    correctOptionIndices: defaultCorrectOptions(kind),
    tags: [],
  };
}

/** Empty options take the preset answers of the new kind; filled ones keep theirs, Single Choice only the first. */
export function choiceKindPatch(draft: ManualCreationDraft, kind: "single-choice" | "multiple-choice"): Partial<ManualCreationDraft> {
  if (draft.answerOptions.every((option) => !option.trim())) return { kind, answerOptions: EMPTY_ANSWER_OPTIONS, correctOptionIndices: defaultCorrectOptions(kind) };
  return { kind, correctOptionIndices: kind === "single-choice" ? [draft.correctOptionIndices[0] ?? 0] : draft.correctOptionIndices };
}

export function createManualBatchSession(targetDeckId = ""): ManualBatchSessionState {
  return {
    createdCount: 0,
    targetDeckId,
    currentDraft: createManualDraft(),
    pinnedFields: { front: false, back: false },
  };
}

function resetManualDraft(
  draft: ManualCreationDraft,
  pinnedFields: ManualBatchSessionState["pinnedFields"],
): ManualCreationDraft {
  return {
    ...draft,
    // Cloze follows the front markup, so a cleared front is a standard draft again.
    kind: draft.kind === "cloze" && !pinnedFields.front ? "basic" : draft.kind,
    front: pinnedFields.front ? draft.front : "",
    back: pinnedFields.back ? draft.back : "",
    answerOptions: EMPTY_ANSWER_OPTIONS,
    correctOptionIndices: defaultCorrectOptions(draft.kind),
    tags: [],
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
  if (action.type === "discard") {
    return { ...state, currentDraft: resetManualDraft(state.currentDraft, { front: false, back: false }) };
  }
  return {
    ...state,
    createdCount: state.createdCount + 1,
    targetDeckId: action.targetDeckId,
    currentDraft: resetManualDraft(state.currentDraft, state.pinnedFields),
  };
}

/** Answer options only count for choice questions; elsewhere they are leftovers of a type switch or an older draft. */
function comparableDraft(draft: ManualCreationDraft) {
  return draft.kind === "single-choice" || draft.kind === "multiple-choice" ? draft : { ...draft, answerOptions: [], correctOptionIndices: [] };
}

export function manualDraftsEqual(left: ManualCreationDraft, right: ManualCreationDraft): boolean {
  return JSON.stringify(comparableDraft(left)) === JSON.stringify(comparableDraft(right));
}

export function nextManualFocusTarget(state: ManualBatchSessionState): ManualFocusTarget {
  if (!state.pinnedFields.front) return "front";
  if (!state.pinnedFields.back) return "back";
  if (state.currentDraft.kind === "single-choice" || state.currentDraft.kind === "multiple-choice") return "option-0";
  return "front";
}
