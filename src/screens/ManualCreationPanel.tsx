import React from "react";
import { ArrowDown, ArrowUp, CircleAlert, Database, Eye, FileText, PenLine, Pin, PinOff, Plus, X } from "lucide-react";
import {
  createManualBatchSession,
  manualDraftsEqual,
  nextManualFocusTarget,
  reduceManualBatchSession,
  type ManualFocusTarget,
} from "../creationBatch.ts";
import { createNote, type AddableFieldRole, type ManualNoteErrors } from "../coreModel.ts";
import type { CreationWorkflow, ManualCreationInput, ManualImageAttachment } from "../creationWorkflow.ts";
import type { MediaSyncProgress } from "../mediaStore.ts";
import type { Deck, NoteContent } from "../coreTypes.ts";
import type { TransientSourceDocument } from "../documentModel.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl, OrbIcon, SoftPanel } from "../ui/coreUi.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { FileDropField } from "../ui/FileDropField.tsx";
import { PdfDocumentViewer } from "../ui/PdfDocumentViewer.tsx";
import { RichTextEditor, type RichTextImageActions } from "../ui/RichTextEditor.tsx";
import { CardPreviewDialog } from "../ui/CardPreviewDialog.tsx";
import { NOTE_FIELD_ROLE_LABELS, NoteBlockControls } from "../ui/NoteBlockControls.tsx";
import { CoreSelect, DeckSelect } from "../ui/selectUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { formatBytes } from "./screenConstants.ts";

type ManualCreationWorkflow = Pick<
  CreationWorkflow,
  | "captureManualSelection"
  | "validateManualCard"
  | "readSourceDocument"
  | "prepareManualImage"
  | "getManualImageReferences"
  | "getReferencedManualImages"
  | "prepareManualMedia"
  | "syncManualMedia"
>;
type PdfSelectionOptions = Parameters<NonNullable<React.ComponentProps<typeof PdfDocumentViewer>["onSelection"]>>[1];
type ActiveField = "front" | "back";
type AdditionalField = { id: string; name: string; value: string; role: AddableFieldRole };
type ManualSaveProgress = { label: string; percent: number };
const FIELD_ROLE_OPTIONS = (["prompt", "hint", "extra", "source"] as const).map((value) => ({ value, label: NOTE_FIELD_ROLE_LABELS[value] }));
const QUESTION_TYPE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "single-choice", label: "Single Choice" },
  { value: "multiple-choice", label: "Multiple Choice" },
] as const;
const LEARNING_DIRECTION_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "both", label: "Beide Richtungen" },
] as const;

/** A validated manual content; without a deck id the content goes into a new deck of that name. */
export interface ManualNoteSaveInput {
  deckId: string | null;
  deckName: string;
  content: NoteContent;
  media: Record<string, string>;
}

export interface ManualCreationPanelProps {
  decks: Deck[];
  workflow: ManualCreationWorkflow;
  initialTargetDeckId?: string;
  onSaveManualNote: (input: ManualNoteSaveInput) => Promise<{ deck: Deck; cardIds: string[] } | null>;
  onTargetDeckChange?: (deckId: string) => unknown;
  onFinish?: (result: { createdCount: number; targetDeckId: string; lastSavedCardId: string | null }) => void;
  onDraftStateChange?: (dirty: boolean, focusDraft: (() => void) | null, saving: boolean) => void;
}

interface PinFieldButtonProps {
  isPinned: boolean;
  label: string;
  onToggle: () => void;
}

interface ManualImageDraft {
  attachment: ManualImageAttachment;
  previewUrl: string;
}

function documentStatusMessage(document: TransientSourceDocument | null): string {
  if (!document) return "";
  if (document.textExtractionStatus === "success") return "Text ist bereit.";
  if (document.textExtractionStatus === "empty") return "Kein Textlayer gefunden.";
  if (document.textExtractionStatus === "unsupported" && document.metadata.userMessage) return String(document.metadata.userMessage);
  if (document.textExtractionStatus === "unsupported") return "Dieses Dateiformat kann in diesem Schritt noch nicht ausgelesen werden.";
  if (document.textExtractionStatus === "error") return String(document.metadata.extractionError || "Dokument konnte nicht ausgelesen werden.");
  return "Dokument als Quelle gespeichert; Textextraktion steht aus.";
}

function isPdfDocument(document: TransientSourceDocument | null): boolean {
  return document?.mimeType === "application/pdf";
}

function PinFieldButton({ isPinned, label, onToggle }: PinFieldButtonProps) {
  const Icon = isPinned ? Pin : PinOff;
  const title = isPinned
    ? `${label}: Nach Speichern behalten`
    : `${label}: Nach Speichern leeren. Zum Behalten anheften`;

  return (
    <CoreTooltip label={title}>
      <button
        type="button"
        aria-label={title}
        aria-pressed={isPinned}
        onClick={onToggle}
        className={`grid size-control shrink-0 place-items-center rounded-inset border transition ${
          isPinned
            ? "border-core-border-strong bg-core-subtle text-core-action shadow-selection"
            : "border-core-border bg-core-surface text-core-border-strong hover:border-core-border-strong hover:text-core-action"
        }`}
      >
        <Icon size={15} aria-hidden="true" />
      </button>
    </CoreTooltip>
  );
}

export function ManualCreationPanel({
  decks,
  workflow,
  onSaveManualNote,
  initialTargetDeckId = "",
  onTargetDeckChange = () => undefined,
  onFinish = () => undefined,
  onDraftStateChange = () => undefined,
}: ManualCreationPanelProps) {
  const editorRootRef = React.useRef<HTMLDivElement | null>(null);
  const saveProgressRef = React.useRef<HTMLDivElement | null>(null);
  const saveInFlightRef = React.useRef(false);
  const [useNewDeck, setUseNewDeck] = React.useState(decks.length === 0);
  const targetDeckMissing = Boolean(initialTargetDeckId && !decks.some((deck) => deck.id === initialTargetDeckId));
  const selectedDeckId = targetDeckMissing ? "" : initialTargetDeckId || decks[0]?.id || "";
  const [deckName, setDeckName] = React.useState("Manueller Kartenstapel");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const previewButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [batchState, dispatchBatch] = React.useReducer(reduceManualBatchSession, selectedDeckId, createManualBatchSession);
  const cleanDraftRef = React.useRef(batchState.currentDraft);
  const { currentDraft, pinnedFields } = batchState;
  const { kind, front, back, answerOptions, correctOptionIndices, tags, selection } = currentDraft;
  const [activeField, setActiveField] = React.useState<ActiveField>("front");
  const [documentMode, setDocumentMode] = React.useState(false);
  const [document, setDocument] = React.useState<TransientSourceDocument | null>(null);
  const [documentObjectUrl, setDocumentObjectUrl] = React.useState("");
  const [documentText, setDocumentText] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [statusType, setStatusType] = React.useState<"status" | "warning" | "alert">("status");
  const setSuccessToast = useSuccessToast();
  const [fieldErrors, setFieldErrors] = React.useState<ManualNoteErrors>({});
  const imageDraftsRef = React.useRef(new Map<string, ManualImageDraft>());
  const imagePreparationCountRef = React.useRef(0);
  const [imageRegistryVersion, setImageRegistryVersion] = React.useState(0);
  const [isPreparingImage, setIsPreparingImage] = React.useState(false);
  const [additionalFields, setAdditionalFields] = React.useState<AdditionalField[]>([]);
  const [typeIn, setTypeIn] = React.useState(false);
  const [invalidAdditionalFieldIds, setInvalidAdditionalFieldIds] = React.useState<string[]>([]);
  const [saveProgress, setSaveProgress] = React.useState<ManualSaveProgress | null>(null);
  const isSaving = Boolean(saveProgress && saveProgress.percent < 100);
  const pendingFocusRef = React.useRef<ManualFocusTarget | null>(null);
  React.useEffect(() => {
    if (decks.length === 0) setUseNewDeck(true);
  }, [decks.length]);

  React.useEffect(() => {
    const validIndices = correctOptionIndices.filter((index) => index >= 0 && index < answerOptions.length);
    if (validIndices.length !== correctOptionIndices.length || validIndices.length === 0) {
      dispatchBatch({ type: "draft", patch: { correctOptionIndices: validIndices.length > 0 ? validIndices : [0] } });
    }
  }, [answerOptions.length, correctOptionIndices]);

  React.useEffect(
    () => () => {
      if (documentObjectUrl) URL.revokeObjectURL(documentObjectUrl);
    },
    [documentObjectUrl],
  );

  React.useEffect(() => () => {
    for (const image of imageDraftsRef.current.values()) URL.revokeObjectURL(image.previewUrl);
    imageDraftsRef.current.clear();
  }, []);

  const focusField = React.useCallback((target: ManualFocusTarget = activeField) => {
    const field = editorRootRef.current?.querySelector<HTMLElement>(`[data-manual-focus="${target}"]`);
    const focusable = field?.matches('input, [contenteditable="true"]')
      ? field
      : field?.querySelector<HTMLElement>('input:not([type="file"]), [contenteditable="true"]');
    focusable?.focus();
  }, [activeField]);

  // Die Editorfläche ist während des Speicherns inert; der nächste Fokus folgt erst nach ihrer Freigabe.
  React.useEffect(() => {
    if (isSaving || !pendingFocusRef.current) return;
    focusField(pendingFocusRef.current);
    pendingFocusRef.current = null;
  }, [focusField, isSaving]);

  const focusSaveProgress = React.useCallback(() => {
    saveProgressRef.current?.focus();
  }, []);

  const textDraftDirty = React.useMemo(() => !manualDraftsEqual(currentDraft, cleanDraftRef.current), [currentDraft]);
  const draftDirty = textDraftDirty || additionalFields.length > 0;

  React.useEffect(() => {
    onDraftStateChange(draftDirty, isSaving ? focusSaveProgress : () => focusField(), isSaving);
    return () => onDraftStateChange(false, null, false);
  }, [draftDirty, focusField, focusSaveProgress, isSaving, onDraftStateChange]);

  React.useEffect(() => {
    if (!draftDirty && !isSaving) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draftDirty, isSaving]);

  async function handleDocument(file: File) {
    const nextDocument = await workflow.readSourceDocument(file as unknown as Parameters<ManualCreationWorkflow["readSourceDocument"]>[0]);
    setDocument(nextDocument);
    setDocumentObjectUrl(isPdfDocument(nextDocument) ? URL.createObjectURL(file) : "");
    setDocumentText(String(nextDocument.text ?? ""));
    setStatusType(nextDocument.textExtractionStatus === "error" || nextDocument.textExtractionStatus === "unsupported" ? "alert" : "status");
    setStatus(documentStatusMessage(nextDocument));
  }

  function applySelection(selectedText: string, _sourceAnchorOptions: Partial<PdfSelectionOptions> = {}) {
    const next = workflow.captureManualSelection({
      activeField,
      front,
      back,
      selectedText,
    });
    if (!next.changed) return;
    dispatchBatch({
      type: "draft",
      patch: {
        selection: next.selection,
        front: next.front,
        back: next.back,
      },
    });
    setStatusType("status");
    setStatus(`${activeField === "front" ? "Vorderseite" : "Rückseite"} ergänzt.`);
  }

  function captureSelection() {
    const selectedText = window.getSelection?.()?.toString().trim() || "";
    applySelection(selectedText);
  }

  const inlineMediaUrls = React.useMemo(() => Object.fromEntries(
    Array.from(imageDraftsRef.current, ([reference, image]) => [reference, image.previewUrl]),
  ), [imageRegistryVersion]);

  const prepareInlineImage = React.useCallback<RichTextImageActions["prepare"]>(async (file) => {
    imagePreparationCountRef.current += 1;
    setIsPreparingImage(true);
    try {
      const attachment = await workflow.prepareManualImage(file);
      const existing = imageDraftsRef.current.get(attachment.sha1);
      if (existing) {
        return { reference: attachment.sha1, previewUrl: existing.previewUrl, alt: attachment.originalName };
      }
      if (typeof URL.createObjectURL !== "function") throw new Error("Das Bild kann in diesem Browser nicht angezeigt werden.");
      const previewUrl = URL.createObjectURL(attachment.blob);
      imageDraftsRef.current.set(attachment.sha1, { attachment, previewUrl });
      setImageRegistryVersion((version) => version + 1);
      return { reference: attachment.sha1, previewUrl, alt: attachment.originalName };
    } finally {
      imagePreparationCountRef.current = Math.max(0, imagePreparationCountRef.current - 1);
      setIsPreparingImage(imagePreparationCountRef.current > 0);
    }
  }, [workflow]);

  const imageActions = React.useMemo<RichTextImageActions>(() => ({
    mediaUrls: inlineMediaUrls,
    prepare: prepareInlineImage,
  }), [inlineMediaUrls, prepareInlineImage]);

  function pruneInlineImages(input: Pick<ManualCreationInput, "front" | "back" | "additionalFields">) {
    if (imageDraftsRef.current.size === 0) return;
    const references = new Set(workflow.getManualImageReferences(input));
    let changed = false;
    for (const [reference, image] of imageDraftsRef.current) {
      if (references.has(reference)) continue;
      URL.revokeObjectURL(image.previewUrl);
      imageDraftsRef.current.delete(reference);
      changed = true;
    }
    if (changed) setImageRegistryVersion((version) => version + 1);
  }

  function manualInput(): ManualCreationInput {
    return {
      kind,
      front,
      back,
      answerOptions,
      correctOptionIndices,
      tags,
      mediaAttachments: Array.from(imageDraftsRef.current.values(), (image) => image.attachment),
      additionalFields,
      typeIn: typeIn && (kind === "basic" || kind === "basic-reversed"),
    };
  }

  function addAdditionalField(role: AddableFieldRole) {
    const id = `manual-field-${Date.now()}-${additionalFields.length}`;
    setAdditionalFields((current) => {
      const base = NOTE_FIELD_ROLE_LABELS[role];
      const taken = current.filter((field) => field.name === base || field.name.startsWith(`${base} `)).length;
      return [...current, { id, name: taken ? `${base} ${taken + 1}` : base, value: "", role }];
    });
    window.requestAnimationFrame(() => editorRootRef.current?.querySelector<HTMLElement>(`[data-additional-field-name="${id}"]`)?.focus());
  }

  function togglePinnedField(field: ActiveField) {
    dispatchBatch({ type: "toggle-pin", field });
  }

  function updateAnswerOption(index: number, value: string) {
    dispatchBatch({
      type: "draft",
      patch: { answerOptions: answerOptions.map((option, optionIndex) => optionIndex === index ? value : option) },
    });
    setFieldErrors((current) => ({ ...current, options: undefined }));
  }

  function removeAnswerOption(index: number) {
    if (answerOptions.length <= 2) return;
    const isCorrect = correctOptionIndices.includes(index);
    if (kind === "multiple-choice") {
      const falseOptionCount = answerOptions.length - correctOptionIndices.length;
      if ((isCorrect && correctOptionIndices.length === 1) || (!isCorrect && falseOptionCount === 1)) return;
    }
    const nextOptions = answerOptions.filter((_, optionIndex) => optionIndex !== index);
    const nextCorrectOptionIndices = correctOptionIndices
      .filter((optionIndex) => optionIndex !== index)
      .map((optionIndex) => optionIndex > index ? optionIndex - 1 : optionIndex);
    dispatchBatch({
      type: "draft",
      patch: {
        answerOptions: nextOptions,
        correctOptionIndices: nextCorrectOptionIndices.length > 0 ? nextCorrectOptionIndices : [0],
      },
    });
    setFieldErrors((current) => ({ ...current, options: undefined, correctOptions: undefined }));
  }

  function toggleCorrectOption(index: number) {
    if (kind === "single-choice") {
      dispatchBatch({ type: "draft", patch: { correctOptionIndices: [index] } });
    } else if (kind === "multiple-choice") {
      const isCorrect = correctOptionIndices.includes(index);
      if (isCorrect && correctOptionIndices.length === 1) return;
      if (!isCorrect && correctOptionIndices.length >= answerOptions.length - 1) return;
      dispatchBatch({
        type: "draft",
        patch: {
          correctOptionIndices: isCorrect
            ? correctOptionIndices.filter((optionIndex) => optionIndex !== index)
            : [...correctOptionIndices, index].sort((left, right) => left - right),
        },
      });
    }
    setFieldErrors((current) => ({ ...current, correctOptions: undefined }));
  }

  function reportManualMediaProgress(progress: MediaSyncProgress) {
    const ratio = progress.totalBytes > 0
      ? progress.processedBytes / progress.totalBytes
      : progress.total > 0
        ? progress.completed / progress.total
        : 0;
    const byteLabel = progress.totalBytes > 0
      ? ` · ${formatBytes(progress.processedBytes)} von ${formatBytes(progress.totalBytes)}`
      : "";
    setSaveProgress((current) => ({
      label: progress.currentName ? `${progress.currentName} wird hochgeladen${byteLabel}` : "Bilder werden hochgeladen",
      percent: Math.max(current?.percent ?? 0, Math.min(90, 20 + Math.round(Math.max(0, Math.min(1, ratio)) * 70))),
    }));
  }

  function recordSavedCard(deck: Deck, savedCardId: string, mediaStatus: { status: string; message: string }) {
    const nextState = reduceManualBatchSession(batchState, { type: "saved", cardId: savedCardId, targetDeckId: deck.id });
    cleanDraftRef.current = nextState.currentDraft;
    dispatchBatch({ type: "saved", cardId: savedCardId, targetDeckId: deck.id });
    setAdditionalFields([]);
    pruneInlineImages({ front: nextState.currentDraft.front, back: nextState.currentDraft.back, additionalFields: [] });
    setInvalidAdditionalFieldIds([]);
    setFieldErrors({});
    const nextFocus = nextManualFocusTarget(nextState);
    setActiveField(nextFocus === "back" ? "back" : "front");
    pendingFocusRef.current = nextFocus;
    const pending = mediaStatus.status === "local-pending";
    const failed = !pending && mediaStatus.status !== "cloud-ready";
    setStatusType(failed ? "alert" : pending ? "warning" : "status");
    setStatus(failed
      ? mediaStatus.message || "Die Karte ist lokal gespeichert, aber mindestens ein Bild ist unvollständig."
      : pending ? "Karte und Bilder sind lokal gespeichert. Die Cloud-Synchronisierung wird automatisch fortgesetzt." : "");
    setSuccessToast(failed || pending ? "" : "Karte wurde erfolgreich gespeichert.");
  }

  async function saveManualCard() {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    try {
      const normalizedFieldNames = additionalFields.map((field) => field.name.trim().toLocaleLowerCase("de-DE"));
      const invalidFieldIds = additionalFields
        .filter((field, index) => !normalizedFieldNames[index] || normalizedFieldNames.filter((name) => name === normalizedFieldNames[index]).length > 1)
        .map((field) => field.id);
      if (invalidFieldIds.length) {
        setSuccessToast("");
        setInvalidAdditionalFieldIds(invalidFieldIds);
        setStatusType("alert");
        setStatus("Zusatzfelder benötigen eindeutige Namen.");
        window.requestAnimationFrame(() => editorRootRef.current?.querySelector<HTMLElement>(`[data-additional-field-name="${invalidFieldIds[0]}"]`)?.focus());
        return;
      }
      setInvalidAdditionalFieldIds([]);
      const snapshot = {
        ...manualInput(),
        answerOptions: [...answerOptions],
        additionalFields: additionalFields.map((field) => ({ ...field })),
      } satisfies ManualCreationInput;
      const validation = workflow.validateManualCard(snapshot);
      if (!validation.ok) {
        setSuccessToast("");
        setFieldErrors(validation.errors);
        setStatusType("alert");
        setStatus("Bitte die markierten Felder prüfen.");
        const firstInvalidTarget: ManualFocusTarget = validation.errors.front
          ? "front"
          : validation.errors.options || validation.errors.correctOptions
            ? "option-0"
            : "back";
        setActiveField(firstInvalidTarget === "front" ? "front" : "back");
        window.requestAnimationFrame(() => focusField(firstInvalidTarget));
        return;
      }

      const creatingDeck = useNewDeck;
      if (!creatingDeck && !decks.some((deck) => deck.id === selectedDeckId)) throw new Error("Der gewählte Kartenstapel ist nicht mehr verfügbar.");
      const attachmentSnapshot = workflow.getReferencedManualImages(snapshot);
      const hasAttachments = attachmentSnapshot.length > 0;
      setSuccessToast("");
      setStatus("");
      setSaveProgress({
        label: hasAttachments ? "Bilder werden lokal gesichert" : "Karte wird lokal gespeichert",
        percent: hasAttachments ? 5 : 15,
      });
      const preparedMedia = await workflow.prepareManualMedia(attachmentSnapshot);
      setSaveProgress((current) => ({
        label: "Karte wird lokal gespeichert",
        percent: Math.max(current?.percent ?? 0, 15),
      }));

      const saved = await onSaveManualNote({
        deckId: creatingDeck ? null : selectedDeckId,
        deckName: deckName.trim() || "Manueller Kartenstapel",
        content: validation.content,
        media: validation.media,
      });
      if (!saved?.cardIds.length) throw new Error("Karte konnte nicht lokal gespeichert werden.");
      if (creatingDeck) {
        setUseNewDeck(false);
        onTargetDeckChange(saved.deck.id);
      }

      const mediaResult = await workflow.syncManualMedia(preparedMedia, { onProgress: reportManualMediaProgress });
      setSaveProgress({
        label: "Speichervorgang abgeschlossen",
        percent: 100,
      });
      recordSavedCard(saved.deck, saved.cardIds[0], mediaResult);
    } catch (error) {
      setSaveProgress(null);
      setSuccessToast("");
      setStatusType("alert");
      setStatus(error instanceof Error ? error.message : "Karte konnte nicht gespeichert werden.");
    } finally {
      saveInFlightRef.current = false;
    }
  }

  const isSingleChoice = kind === "single-choice";
  const isMultipleChoice = kind === "multiple-choice";
  const isChoice = isSingleChoice || isMultipleChoice;
  const answerLabel = kind === "cloze" ? "Zusatzinfo" : isChoice ? "Erklärung (optional)" : "Rückseite";
  const isCloze = kind === "cloze";
  const isReverse = kind === "basic-reversed";
  const nextClozeGroup = Math.max(0, ...Array.from(front.matchAll(/\{\{c(\d+)::/gi), (match) => Number(match[1]) || 0)) + 1;

  const previewBundle = React.useMemo(() => {
    if (!previewOpen) return null;
    const validation = workflow.validateManualCard(manualInput());
    if (!validation.ok) return null;
    const { note, cards } = createNote({ content: validation.content, deckId: "preview", media: validation.media });
    return { note, card: cards[0] };
  }, [additionalFields, answerOptions, back, kind, correctOptionIndices, front, imageRegistryVersion, previewOpen, tags, typeIn, workflow]);
  const frontFieldActive = activeField === "front";
  const backFieldActive = activeField === "back";
  const shouldShowPdfViewer = documentMode && isPdfDocument(document) && Boolean(documentObjectUrl);

  const editor = (
    <div ref={editorRootRef} className="grid min-w-0 gap-4" aria-busy={isSaving || undefined}>
      <div data-testid="manual-draft-controls" className="grid min-w-0 gap-4" inert={isSaving} aria-disabled={isSaving || undefined}>
      <div className="grid min-w-0 gap-4">
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {!useNewDeck && decks.length > 0 ? (
              <label className="grid min-w-0 flex-[1_1_16rem] gap-2 core-body font-semibold text-core-secondary">
                Kartenstapel
                <DeckSelect
                  ariaLabel="Kartenstapel"
                  className="w-full"
                  value={selectedDeckId}
                  decks={decks}
                  specialOption={targetDeckMissing ? {
                    value: "",
                    label: "Zielstapel nicht gefunden",
                    icon: CircleAlert,
                    tone: "danger",
                  } : undefined}
                  onValueChange={(deckId) => {
                    onTargetDeckChange(deckId);
                    dispatchBatch({ type: "target-deck", deckId });
                  }}
                />
              </label>
            ) : (
              <label className="grid min-w-0 flex-[1_1_16rem] gap-2 core-body font-semibold text-core-secondary">
                Neuer Kartenstapel
                <input className="min-h-control min-w-0 rounded-control border border-core-border px-3" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
              </label>
            )}
            <button type="button" onClick={() => setUseNewDeck((value) => {
              const next = !value;
              const nextDeckId = next ? "" : selectedDeckId || decks[0]?.id || "";
              if (!next && nextDeckId !== initialTargetDeckId) onTargetDeckChange(nextDeckId);
              dispatchBatch({ type: "target-deck", deckId: nextDeckId });
              return next;
            })} className="inline-flex min-h-control min-w-0 max-w-full items-center gap-2 rounded-control border border-core-border px-4 core-body font-semibold text-core-action">
              <Database size={16} aria-hidden="true" />
              {useNewDeck && decks.length > 0 ? "Stapel auswählen" : "Neuen Stapel erstellen"}
            </button>
          </div>
          {targetDeckMissing && !useNewDeck ? (
            <p className="core-status-error core-body" role="alert">
              Zielstapel nicht gefunden oder nicht verfügbar. Wähle einen anderen Stapel oder erstelle einen neuen.
            </p>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-4 md:flex md:flex-wrap md:items-center md:gap-x-6" data-testid="manual-card-options">
          <div className="grid min-w-0 gap-2 sm:grid-cols-[max-content_max-content] sm:items-center sm:gap-3">
            <span className="core-body font-semibold text-core-text">Fragentyp</span>
            <CoreSegmentedControl
              ariaLabel="Fragentyp"
              className="core-question-type-control"
              options={QUESTION_TYPE_OPTIONS}
              value={isChoice ? kind : "standard"}
              onValueChange={(value) => dispatchBatch({
                type: "draft",
                patch: {
                  kind: value === "standard" ? (isChoice ? "basic" : kind) : value,
                  correctOptionIndices: value === "single-choice" ? [correctOptionIndices[0] ?? 0] : correctOptionIndices,
                },
              })}
            />
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[max-content_max-content] sm:items-center sm:gap-3">
            <span className="core-body font-semibold text-core-text">Lernrichtung</span>
            <CoreSegmentedControl
              ariaLabel="Lernrichtung"
              options={LEARNING_DIRECTION_OPTIONS}
              value={isReverse ? "both" : "standard"}
              disabled={isChoice || isCloze}
              onValueChange={(value) => dispatchBatch({ type: "draft", patch: { kind: value === "both" ? "basic-reversed" : "basic" } })}
            />
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-4">
        <div data-manual-focus="front" className="grid min-w-0 gap-2 core-body font-semibold text-core-secondary">
          <div className="flex min-h-control items-center justify-between gap-2">
            <span>{kind === "cloze" ? "Cloze-Text" : isChoice ? "Frage" : "Vorderseite"}</span>
            <PinFieldButton isPinned={pinnedFields.front} label={kind === "cloze" ? "Cloze-Text" : isChoice ? "Frage" : "Vorderseite"} onToggle={() => togglePinnedField("front")} />
          </div>
          <RichTextEditor value={front} onFocus={() => setActiveField("front")} onChange={(value) => {
            const hasClozeMarkup = /\{\{c\d+::/i.test(value);
            dispatchBatch({
              type: "draft",
              patch: {
                front: value,
                ...(!isChoice ? { kind: hasClozeMarkup ? "cloze" : kind === "cloze" ? "basic" : kind } : {}),
              },
            });
            setFieldErrors((current) => ({ ...current, front: undefined }));
          }} clozeActions={isChoice ? undefined : { groupId: nextClozeGroup }} imageActions={imageActions} isActive={frontFieldActive} minHeightClass="min-h-32" ariaLabel={kind === "cloze" ? "Cloze-Text" : isChoice ? `${isSingleChoice ? "Single" : "Multiple"}-Choice-Frage` : "Vorderseite"} ariaInvalid={Boolean(fieldErrors.front)} />
          {!isChoice ? <p className="core-body font-normal text-core-muted">Markiere Text und wähle in der Toolbar „Lücke“. CoRe erzeugt die Lückengruppe automatisch.</p> : null}
          {fieldErrors.front ? <p className="core-body font-medium text-core-text" role="alert">{fieldErrors.front}</p> : null}
        </div>
        {isChoice ? (
          <fieldset className="grid gap-3 rounded-control border border-core-border p-4">
            <legend className="px-1 core-body font-semibold text-core-secondary">
              Antwortoptionen und {isSingleChoice ? "richtige Antwort" : "richtige Antworten"}
            </legend>
            {answerOptions.map((option, index) => {
              const isCorrect = correctOptionIndices.includes(index);
              const falseOptionCount = answerOptions.length - correctOptionIndices.length;
              const correctnessLocked = isMultipleChoice
                && ((isCorrect && correctOptionIndices.length === 1) || (!isCorrect && falseOptionCount === 1));
              const removalLocked = answerOptions.length <= 2 || (isMultipleChoice && correctnessLocked);
              return (
                <div key={index} className="flex min-w-0 items-center gap-2">
                  <label className="grid size-control shrink-0 place-items-center">
                    <input
                      className="size-5"
                      type={isSingleChoice ? "radio" : "checkbox"}
                      name={isSingleChoice ? "manual-correct-option" : undefined}
                      checked={isCorrect}
                      disabled={correctnessLocked}
                      onChange={() => toggleCorrectOption(index)}
                      aria-label={`Option ${index + 1} als richtig markieren`}
                      aria-invalid={Boolean(fieldErrors.correctOptions)}
                    />
                  </label>
                  <input data-manual-focus={index === 0 ? "option-0" : undefined} className="min-h-control min-w-0 flex-1 rounded-control border border-core-border px-3" value={option} onChange={(event) => updateAnswerOption(index, event.target.value)} placeholder={`Option ${index + 1}`} aria-label={`Antwortoption ${index + 1}`} aria-invalid={Boolean(fieldErrors.options)} />
                  <IconButton type="button" icon={X} label={`Antwortoption ${index + 1} entfernen`} onClick={() => removeAnswerOption(index)} disabled={removalLocked} />
                </div>
              );
            })}
            <ActionButton type="button" variant="secondary" icon={Plus} onClick={() => dispatchBatch({ type: "draft", patch: { answerOptions: [...answerOptions, ""] } })} className="w-fit">Option hinzufügen</ActionButton>
            {fieldErrors.options ? <p className="core-body font-medium text-core-text" role="alert">{fieldErrors.options}</p> : null}
            {fieldErrors.correctOptions ? <p className="core-body font-medium text-core-text" role="alert">{fieldErrors.correctOptions}</p> : null}
          </fieldset>
        ) : null}
        <div data-manual-focus="back" className="grid min-w-0 gap-2 core-body font-semibold text-core-secondary">
          <div className="flex min-h-control items-center justify-between gap-2">
            <span>{answerLabel}</span>
            <PinFieldButton isPinned={pinnedFields.back} label={answerLabel} onToggle={() => togglePinnedField("back")} />
          </div>
          <RichTextEditor value={back} onFocus={() => setActiveField("back")} onChange={(value) => {
            dispatchBatch({ type: "draft", patch: { back: value } });
            setFieldErrors((current) => ({ ...current, back: undefined }));
          }} imageActions={imageActions} isActive={backFieldActive} minHeightClass="min-h-32" ariaLabel={answerLabel} ariaInvalid={Boolean(fieldErrors.back)} />
          {fieldErrors.back ? <p className="core-body font-medium text-core-text" role="alert">{fieldErrors.back}</p> : null}
        </div>
      </div>

      <div className="grid gap-4">
          {additionalFields.map((field, index) => (
            <div key={field.id} className="grid min-w-0 gap-3 rounded-control border border-core-border bg-core-surface p-4">
              <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
                <label className="grid gap-2 core-body font-semibold text-core-secondary">
                  Feldname
                  <input
                    className="min-h-control min-w-0 rounded-control border border-core-border px-3"
                    value={field.name}
                    data-additional-field-name={field.id}
                    aria-invalid={invalidAdditionalFieldIds.includes(field.id) || undefined}
                    aria-describedby={invalidAdditionalFieldIds.includes(field.id) ? `additional-field-error-${field.id}` : undefined}
                    onChange={(event) => {
                      setAdditionalFields((current) => current.map((candidate) => candidate.id === field.id ? { ...candidate, name: event.target.value } : candidate));
                      setInvalidAdditionalFieldIds((current) => current.filter((id) => id !== field.id));
                    }}
                  />
                  {invalidAdditionalFieldIds.includes(field.id) ? <span id={`additional-field-error-${field.id}`} className="core-caption font-medium text-core-text" role="alert">Bitte einen eindeutigen Feldnamen eingeben.</span> : null}
                </label>
                <label className="grid gap-2 core-body font-semibold text-core-secondary">
                  Rolle
                  <CoreSelect ariaLabel={`Rolle von ${field.name || `Feld ${index + 1}`}`} value={field.role} options={FIELD_ROLE_OPTIONS} onValueChange={(role) => setAdditionalFields((current) => current.map((candidate) => candidate.id === field.id ? { ...candidate, role: role as AddableFieldRole } : candidate))} />
                </label>
                <div className="flex items-end gap-1">
                  {index > 0 ? <IconButton type="button" icon={ArrowUp} label={`${field.name || `Feld ${index + 1}`} nach oben`} onClick={() => setAdditionalFields((current) => {
                    const next = [...current];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    return next;
                  })} /> : null}
                  {index < additionalFields.length - 1 ? <IconButton type="button" icon={ArrowDown} label={`${field.name || `Feld ${index + 1}`} nach unten`} onClick={() => setAdditionalFields((current) => {
                    const next = [...current];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    return next;
                  })} /> : null}
                  <IconButton type="button" icon={X} label={`${field.name || `Feld ${index + 1}`} entfernen`} onClick={() => {
                    const next = additionalFields.filter((candidate) => candidate.id !== field.id);
                    pruneInlineImages({ front, back, additionalFields: next });
                    setAdditionalFields(next);
                  }} />
                </div>
              </div>
              <RichTextEditor value={field.value} onChange={(value) => {
                const next = additionalFields.map((candidate) => candidate.id === field.id ? { ...candidate, value } : candidate);
                setAdditionalFields(next);
              }} imageActions={imageActions} ariaLabel={`Inhalt von ${field.name || `Feld ${index + 1}`}`} minHeightClass="min-h-24" />
            </div>
          ))}
          <NoteBlockControls
            typeIn={kind === "basic" || kind === "basic-reversed" ? typeIn : null}
            fieldRoles={FIELD_ROLE_OPTIONS.map((option) => option.value)}
            onTypeInChange={setTypeIn}
            onAddField={addAdditionalField}
          />
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2 core-body font-semibold text-core-secondary">
          Tags
          <input className="min-h-control rounded-control border border-core-border px-3" value={tags} onChange={(event) => dispatchBatch({ type: "draft", patch: { tags: event.target.value } })} placeholder="biologie zelle prüfung" />
        </label>
      </div>
      </div>
      {saveProgress ? (
        <div
          ref={saveProgressRef}
          className="relative overflow-hidden rounded-control border border-core-border bg-core-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-2"
          data-testid="manual-save-progress"
          role="progressbar"
          aria-label="Fortschritt der Kartenspeicherung"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={saveProgress.percent}
          aria-valuetext={`${saveProgress.label} · ${saveProgress.percent} Prozent`}
          aria-live="polite"
          tabIndex={-1}
        >
          <span
            data-testid="manual-save-progress-fill"
            className="pointer-events-none absolute inset-y-0 left-0 bg-core-subtle transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${saveProgress.percent}%` }}
            aria-hidden="true"
          />
          <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-words core-body font-semibold text-core-text">{saveProgress.label}</p>
            <p className="shrink-0 core-body font-semibold text-core-text">{saveProgress.percent} %</p>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <ActionButton data-testid="manual-save-button" type="button" variant="primary" icon={Database} loading={isSaving} disabled={isPreparingImage || isSaving} onClick={() => void saveManualCard()}>
          {isSaving ? "Karte wird gespeichert" : "Originalkarte speichern"}
        </ActionButton>
        <ActionButton
          type="button"
          variant="secondary"
          disabled={batchState.createdCount === 0 || isSaving}
          onClick={() => onFinish({
            createdCount: batchState.createdCount,
            targetDeckId: batchState.targetDeckId,
            lastSavedCardId: batchState.lastSavedCardId,
          })}
        >
          Fertig
        </ActionButton>
      </div>
      <p className="core-body font-medium text-core-muted">{batchState.createdCount} {batchState.createdCount === 1 ? "Karte" : "Karten"} in dieser Sitzung erstellt.</p>
      {status ? <p className={`core-body ${statusType === "alert" ? "core-status-error" : statusType === "warning" ? "core-status-warning" : "core-status-info"}`} role={statusType === "alert" ? "alert" : "status"} aria-live="polite">{status}</p> : null}
      <CardPreviewDialog
        open={previewOpen}
        note={previewBundle?.note ?? null}
        card={previewBundle?.card ?? null}
        mediaUrls={inlineMediaUrls}
        onOpenChange={setPreviewOpen}
        returnFocusRef={previewButtonRef}
      />
    </div>
  );

  return (
    <SoftPanel className="core-responsive-panel-padding min-h-[calc(100vh-15rem)] p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <OrbIcon icon={PenLine} className="bg-core-info-soft text-core-text" />
          <h2 className="core-heading-2 font-semibold text-core-text">Karte selbst erstellen</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {!documentMode ? <ActionButton type="button" variant="secondary" icon={FileText} onClick={() => setDocumentMode(true)}>PDF/Text anfügen</ActionButton> : null}
          <ActionButton ref={previewButtonRef} type="button" variant="secondary" icon={Eye} disabled={isSaving} onClick={() => setPreviewOpen(true)}>Vorschau</ActionButton>
        </div>
      </div>

      {documentMode ? (
        <div className={`grid gap-4 ${document ? "xl:grid-cols-2" : ""}`}>
          <div className="grid content-start gap-4" inert={isSaving} aria-disabled={isSaving || undefined}>
            <FileDropField kind="document" selected={Boolean(document)} onFile={handleDocument} disabled={isSaving}>
              {document ? <p className="truncate core-caption text-core-muted">{document.fileName}</p> : null}
            </FileDropField>
            {document && !shouldShowPdfViewer ? (
              <div className="rounded-control border border-core-border bg-core-subtle p-3 core-body text-core-muted">
                <p>{documentStatusMessage(document)}</p>
              </div>
            ) : null}
            {shouldShowPdfViewer && document ? (
              <PdfDocumentViewer document={document} src={documentObjectUrl} onSelection={applySelection} />
            ) : documentText ? (
              <div className="max-h-[40rem] min-h-[40rem] overflow-auto rounded-control border border-core-border bg-core-surface p-4 core-body leading-6 text-core-text" onMouseUp={captureSelection} onKeyUp={captureSelection} tabIndex={0}>
                <pre className="whitespace-pre-wrap break-words font-sans">{documentText}</pre>
              </div>
            ) : null}
          </div>
          {editor}
        </div>
      ) : (
        editor
      )}
    </SoftPanel>
  );
}
