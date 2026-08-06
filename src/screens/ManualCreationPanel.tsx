import React from "react";
import { CircleAlert, Database, FileText, ImagePlus, PenLine, Pin, PinOff, Plus, Upload, X } from "lucide-react";
import {
  createManualBatchSession,
  manualDraftsEqual,
  nextManualFocusTarget,
  reduceManualBatchSession,
  type ManualFocusTarget,
} from "../creationBatch.ts";
import type { CreationWorkflow, ManualImageAttachment } from "../creationWorkflow.ts";
import type { CardEditorFieldErrors, CardType, Deck, SourceDocument } from "../coreTypes.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { OrbIcon, SoftPanel } from "../ui/coreUi.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { PdfDocumentViewer } from "../ui/PdfDocumentViewer.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";
import { CoreSelect, DeckSelect } from "../ui/selectUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { cardTypeOptions, formatBytes } from "./screenConstants.ts";

type ManualCreationWorkflow = Pick<
  CreationWorkflow,
  | "captureManualSelection"
  | "createManualDeck"
  | "createManualDeckInput"
  | "validateManualCard"
  | "readableSourceDocumentAccept"
  | "readableSourceDocumentLabel"
  | "readSourceDocument"
  | "prepareManualImage"
  | "syncManualMedia"
>;
type ManualCreationInput = NonNullable<Parameters<ManualCreationWorkflow["createManualDeck"]>[0]>;
type ManualDeckInput = ReturnType<ManualCreationWorkflow["createManualDeckInput"]>;
type PdfSelectionOptions = Parameters<NonNullable<React.ComponentProps<typeof PdfDocumentViewer>["onSelection"]>>[1];
type ActiveField = "front" | "back";

export interface ManualCreationPanelProps {
  decks: Deck[];
  workflow: ManualCreationWorkflow;
  documentMode?: boolean;
  initialTargetDeckId?: string;
  onCreated: (deck: Deck) => unknown;
  onAppendManualCard: (deckId: string, input: ManualDeckInput) => Promise<Deck | null>;
  onTargetDeckChange?: (deckId: string) => unknown;
  onFinish?: (result: { createdCount: number; targetDeckId: string; lastSavedCardId: string | null }) => void;
  onDraftStateChange?: (dirty: boolean, focusDraft: (() => void) | null) => void;
}

interface PinFieldButtonProps {
  isPinned: boolean;
  label: string;
  onToggle: () => void;
}

interface ManualImageFieldProps {
  label: string;
  value: ManualImageAttachment | null;
  busy: boolean;
  error: string;
  onFile: (file: File) => void;
  onRemove: () => void;
}

function documentStatusMessage(document: SourceDocument | null): string {
  if (!document) return "";
  if (document.textExtractionStatus === "success") return "Text ist bereit.";
  if (document.textExtractionStatus === "empty") return "Kein Textlayer gefunden.";
  if (document.textExtractionStatus === "unsupported" && document.metadata.userMessage) return String(document.metadata.userMessage);
  if (document.textExtractionStatus === "unsupported") return "Dieses Dateiformat kann in diesem Schritt noch nicht ausgelesen werden.";
  if (document.textExtractionStatus === "error") return String(document.metadata.extractionError || "Dokument konnte nicht ausgelesen werden.");
  return "Dokument als Quelle gespeichert; Textextraktion steht aus.";
}

function isPdfDocument(document: SourceDocument | null): boolean {
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
        className={`grid size-11 shrink-0 place-items-center rounded-lg border transition ${
          isPinned
            ? "border-[var(--core-border-interactive)] bg-[var(--core-surface-muted)] text-[var(--core-action-primary)] shadow-[0_0_0_2px_var(--core-focus-ring-soft)]"
            : "border-[var(--core-border)] bg-core-surface text-[var(--core-border-interactive)] hover:border-[var(--core-border-interactive)] hover:text-[var(--core-action-primary)]"
        }`}
      >
        <Icon size={15} aria-hidden="true" />
      </button>
    </CoreTooltip>
  );
}

function ManualImageField({ label, value, busy, error, onFile, onRemove }: ManualImageFieldProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState("");

  React.useEffect(() => {
    if (!value || typeof URL?.createObjectURL !== "function") {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(value.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  function useFirstFile(files: FileList | null | undefined) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
      <span>{label}</span>
      <div
        tabIndex={0}
        role="group"
        aria-label={`${label}: Bild einfügen oder ablegen`}
        aria-busy={busy || undefined}
        onPaste={(event) => {
          const file = [...event.clipboardData.files].find((candidate) => candidate.type.startsWith("image/"))
            ?? [...event.clipboardData.items].find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
          if (!file) return;
          event.preventDefault();
          onFile(file);
        }}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setIsDragging(true); }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setIsDragging(false);
        }}
        onDrop={(event) => { event.preventDefault(); setIsDragging(false); useFirstFile(event.dataTransfer.files); }}
        className={`min-h-32 rounded-xl border-2 border-dashed p-4 outline-none transition ${isDragging ? "border-[var(--core-action-primary)] bg-[var(--core-info-surface)]" : "border-[var(--core-border-interactive)] bg-[var(--core-surface-muted)]"}`}
      >
        <input ref={inputRef} type="file" accept="image/*" hidden tabIndex={-1} onChange={(event) => { useFirstFile(event.target.files); event.target.value = ""; }} />
        {value ? (
          <div className="flex min-w-0 flex-col items-center gap-3 sm:flex-row">
            {previewUrl ? <img src={previewUrl} alt="Vorschau des ausgewählten Bildes" className="h-28 w-full rounded-lg border border-[var(--core-border)] bg-core-surface object-contain sm:w-40" /> : null}
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="truncate core-body font-semibold text-[var(--core-text)]">{value.originalName}</p>
              <p className="mt-1 core-caption font-normal text-[var(--core-text-muted)]">{formatBytes(value.size)} · Strg+V oder Drop ersetzt das Bild</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                <ActionButton type="button" variant="secondary" icon={Upload} onClick={() => inputRef.current?.click()} disabled={busy}>Ersetzen</ActionButton>
                <ActionButton type="button" variant="destructive" icon={X} onClick={onRemove} disabled={busy}>Entfernen</ActionButton>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-24 place-items-center text-center">
            <div>
              <ImagePlus className="mx-auto text-[var(--core-action-primary)]" size={26} aria-hidden="true" />
              <p className="mt-2 core-body font-semibold text-[var(--core-text)]">Bild mit Strg+V einfügen oder hier ablegen</p>
              <ActionButton type="button" variant="secondary" icon={Upload} className="mt-3" onClick={() => inputRef.current?.click()} disabled={busy}>Bild auswählen</ActionButton>
            </div>
          </div>
        )}
      </div>
      {busy ? <p className="core-caption font-normal text-[var(--core-text-muted)]" role="status">Bild wird vorbereitet …</p> : null}
      {error ? <p className="core-body font-medium text-core-text" role="alert">{error}</p> : null}
    </div>
  );
}

export function ManualCreationPanel({
  decks,
  workflow,
  onCreated,
  onAppendManualCard,
  initialTargetDeckId = "",
  onTargetDeckChange = () => undefined,
  onFinish = () => undefined,
  onDraftStateChange = () => undefined,
  documentMode = false,
}: ManualCreationPanelProps) {
  const sourceInputRef = React.useRef<HTMLInputElement | null>(null);
  const editorRootRef = React.useRef<HTMLDivElement | null>(null);
  const [useNewDeck, setUseNewDeck] = React.useState(decks.length === 0);
  const targetDeckMissing = Boolean(initialTargetDeckId && !decks.some((deck) => deck.id === initialTargetDeckId));
  const selectedDeckId = targetDeckMissing ? "" : initialTargetDeckId || decks[0]?.id || "";
  const [deckName, setDeckName] = React.useState("Manueller Kartenstapel");
  const [batchState, dispatchBatch] = React.useReducer(reduceManualBatchSession, selectedDeckId, createManualBatchSession);
  const cleanDraftRef = React.useRef(batchState.currentDraft);
  const { currentDraft, pinnedFields } = batchState;
  const { cardType, front, back, answerOptions, correctOptionIndex, tags, selection, sourceAnchor } = currentDraft;
  const [activeField, setActiveField] = React.useState<ActiveField>("front");
  const [showDocumentMode, setShowDocumentMode] = React.useState(documentMode);
  const [document, setDocument] = React.useState<SourceDocument | null>(null);
  const [documentObjectUrl, setDocumentObjectUrl] = React.useState("");
  const [documentText, setDocumentText] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [statusType, setStatusType] = React.useState<"status" | "alert">("status");
  const setSuccessToast = useSuccessToast();
  const [fieldErrors, setFieldErrors] = React.useState<CardEditorFieldErrors>({});
  const [frontImage, setFrontImage] = React.useState<ManualImageAttachment | null>(null);
  const [backImage, setBackImage] = React.useState<ManualImageAttachment | null>(null);
  const [preparingImage, setPreparingImage] = React.useState<ActiveField | null>(null);
  const [imageErrors, setImageErrors] = React.useState<Record<ActiveField, string>>({ front: "", back: "" });
  React.useEffect(() => {
    if (decks.length === 0) setUseNewDeck(true);
  }, [decks.length]);

  React.useEffect(() => {
    setShowDocumentMode(documentMode);
  }, [documentMode]);

  React.useEffect(() => {
    if (correctOptionIndex >= answerOptions.length) dispatchBatch({ type: "draft", patch: { correctOptionIndex: 0 } });
  }, [answerOptions.length, correctOptionIndex]);

  React.useEffect(
    () => () => {
      if (documentObjectUrl) URL.revokeObjectURL(documentObjectUrl);
    },
    [documentObjectUrl],
  );

  const focusField = React.useCallback((target: ManualFocusTarget = activeField) => {
    const field = editorRootRef.current?.querySelector<HTMLElement>(`[data-manual-focus="${target}"]`);
    const focusable = field?.matches('input, [contenteditable="true"]')
      ? field
      : field?.querySelector<HTMLElement>('input, [contenteditable="true"]');
    focusable?.focus();
  }, [activeField]);

  const textDraftDirty = React.useMemo(() => !manualDraftsEqual(currentDraft, cleanDraftRef.current), [currentDraft]);
  const draftDirty = textDraftDirty || Boolean(frontImage || backImage);

  React.useEffect(() => {
    onDraftStateChange(draftDirty, () => focusField());
    return () => onDraftStateChange(false, null);
  }, [draftDirty, focusField, onDraftStateChange]);

  React.useEffect(() => {
    if (!draftDirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draftDirty]);

  async function handleDocument(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const nextDocument = await workflow.readSourceDocument(file as unknown as Parameters<ManualCreationWorkflow["readSourceDocument"]>[0]);
    setDocument(nextDocument);
    setDocumentObjectUrl(isPdfDocument(nextDocument) ? URL.createObjectURL(file) : "");
    setDocumentText(String(nextDocument.text ?? ""));
    setShowDocumentMode(true);
    setStatusType(nextDocument.textExtractionStatus === "error" || nextDocument.textExtractionStatus === "unsupported" ? "alert" : "status");
    setStatus(documentStatusMessage(nextDocument));
    event.target.value = "";
  }

  function openSourcePicker() {
    setShowDocumentMode(true);
    window.setTimeout(() => sourceInputRef.current?.click(), 0);
  }

  function applySelection(selectedText: string, sourceAnchorOptions: Partial<PdfSelectionOptions> = {}) {
    const next = workflow.captureManualSelection({
      activeField,
      front,
      back,
      document,
      documentText,
      selectedText,
      sourceAnchorOptions,
    });
    if (!next.changed) return;
    dispatchBatch({
      type: "draft",
      patch: {
        selection: next.selection,
        sourceAnchor: next.sourceAnchor ?? null,
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

  function manualInput(): ManualCreationInput {
    const selectedDeck = decks.find((deck) => deck.id === selectedDeckId);
    return {
      deckName: useNewDeck ? deckName : selectedDeck?.name ?? deckName,
      cardType,
      front,
      back,
      answerOptions,
      correctAnswer: answerOptions[correctOptionIndex] ?? "",
      expectedAnswer: back,
      tags,
      document,
      documentText,
      selection,
      sourceAnchor: sourceAnchor ?? undefined,
      activeField,
      frontImage,
      backImage,
    };
  }

  async function prepareImage(field: ActiveField, file: File) {
    setPreparingImage(field);
    setImageErrors((current) => ({ ...current, [field]: "" }));
    try {
      const image = await workflow.prepareManualImage(file);
      if (field === "front") setFrontImage(image);
      else setBackImage(image);
    } catch (error) {
      setImageErrors((current) => ({ ...current, [field]: error instanceof Error ? error.message : "Bild konnte nicht verarbeitet werden." }));
    } finally {
      setPreparingImage(null);
    }
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
    const nextOptions = answerOptions.filter((_, optionIndex) => optionIndex !== index);
    const nextCorrectOptionIndex = correctOptionIndex === index ? 0 : correctOptionIndex > index ? correctOptionIndex - 1 : correctOptionIndex;
    dispatchBatch({ type: "draft", patch: { answerOptions: nextOptions, correctOptionIndex: nextCorrectOptionIndex } });
    setFieldErrors((current) => ({ ...current, options: undefined, correctOptionIndex: undefined }));
  }

  function recordSavedCard(deck: Deck, previousCardIds: Set<string>, mediaStatus?: { status: string; message: string; errors: string[] }) {
    const savedCard = (deck.cards ?? []).find((card) => !previousCardIds.has(card.id)) ?? deck.cards.at(-1);
    if (!savedCard) return;
    const nextState = reduceManualBatchSession(batchState, { type: "saved", cardId: savedCard.id, targetDeckId: deck.id });
    cleanDraftRef.current = nextState.currentDraft;
    dispatchBatch({ type: "saved", cardId: savedCard.id, targetDeckId: deck.id });
    setFrontImage(null);
    setBackImage(null);
    setImageErrors({ front: "", back: "" });
    setFieldErrors({});
    const nextFocus = nextManualFocusTarget(nextState);
    setActiveField(nextFocus === "back" ? "back" : "front");
    setStatusType(mediaStatus?.status === "blocked" || mediaStatus?.status === "partial" ? "alert" : "status");
    setStatus(mediaStatus?.message || mediaStatus?.errors[0] || "");
    setSuccessToast("Karte wurde erfolgreich gespeichert.");
    window.requestAnimationFrame(() => focusField(nextFocus));
  }

  async function saveManualCard() {
    const validation = workflow.validateManualCard(manualInput());
    if (!validation.ok) {
      setSuccessToast("");
      setFieldErrors(validation.errors);
      setStatusType("alert");
      setStatus("Bitte die markierten Felder prüfen.");
      return;
    }
    try {
      const input = manualInput();
      if (!useNewDeck && selectedDeckId) {
        const previousCardIds = new Set(decks.find((deck) => deck.id === selectedDeckId)?.cards.map((card) => card.id) ?? []);
        const updatedDeck = await onAppendManualCard(selectedDeckId, workflow.createManualDeckInput(input));
        if (updatedDeck) {
          const mediaResult = await workflow.syncManualMedia(updatedDeck, [frontImage, backImage]);
          recordSavedCard(mediaResult.deck, previousCardIds, mediaResult);
        }
        return;
      }

      const deck = workflow.createManualDeck(input);
      const createdResult = await onCreated(deck);
      const createdDeck = createdResult && typeof createdResult === "object" && "cards" in createdResult ? createdResult as Deck : deck;
      const mediaResult = await workflow.syncManualMedia(createdDeck, [frontImage, backImage]);
      setUseNewDeck(false);
      onTargetDeckChange(mediaResult.deck.id);
      recordSavedCard(mediaResult.deck, new Set(), mediaResult);
    } catch (error) {
      setSuccessToast("");
      setStatusType("alert");
      setStatus(error instanceof Error ? error.message : "Karte konnte nicht gespeichert werden.");
    }
  }

  const answerLabel = cardType === "cloze" ? "Zusatzinfo" : cardType === "multiple-choice" ? "Erklärung (optional)" : "Rückseite";
  const frontFieldActive = activeField === "front";
  const backFieldActive = activeField === "back";
  const shouldShowPdfViewer = showDocumentMode && isPdfDocument(document) && Boolean(documentObjectUrl);
  const sourceFileName = document?.fileName ?? "Keine Datei ausgewählt";

  const editor = (
    <div ref={editorRootRef} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {!useNewDeck && decks.length > 0 ? (
              <label className="grid min-w-[16rem] flex-1 gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
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
              <label className="grid min-w-[16rem] flex-1 gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                Neuer Kartenstapel
                <input className="min-h-11 rounded-xl border border-[var(--core-border)] px-3" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
              </label>
            )}
            <button type="button" onClick={() => setUseNewDeck((value) => {
              const next = !value;
              const nextDeckId = next ? "" : selectedDeckId || decks[0]?.id || "";
              if (!next && nextDeckId !== initialTargetDeckId) onTargetDeckChange(nextDeckId);
              dispatchBatch({ type: "target-deck", deckId: nextDeckId });
              return next;
            })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] px-4 core-body font-semibold text-[var(--core-action-primary)]">
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

        <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
          Kartentyp
          <CoreSelect
            ariaLabel="Kartentyp"
            className="w-full"
            value={cardType}
            options={cardTypeOptions}
            onValueChange={(nextCardType) => {
              dispatchBatch({ type: "draft", patch: { cardType: nextCardType as CardType } });
              if (nextCardType !== "basic-with-images") {
                setFrontImage(null);
                setBackImage(null);
                setImageErrors({ front: "", back: "" });
              }
            }}
          />
        </label>
      </div>

      <div className="grid min-w-0 gap-4">
        <div data-manual-focus="front" className="grid min-w-0 gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <span>{cardType === "cloze" ? "Cloze-Text" : cardType === "multiple-choice" ? "Frage" : "Vorderseite"}</span>
            <PinFieldButton isPinned={pinnedFields.front} label={cardType === "cloze" ? "Cloze-Text" : cardType === "multiple-choice" ? "Frage" : "Vorderseite"} onToggle={() => togglePinnedField("front")} />
          </div>
          <RichTextEditor value={front} onFocus={() => setActiveField("front")} onChange={(value) => {
            dispatchBatch({ type: "draft", patch: { front: value } });
            setFieldErrors((current) => ({ ...current, front: undefined, question: undefined, textWithClozes: undefined }));
          }} isActive={frontFieldActive} minHeightClass="min-h-32" ariaLabel={cardType === "cloze" ? "Cloze-Text" : cardType === "multiple-choice" ? "Multiple-Choice-Frage" : "Vorderseite"} ariaInvalid={Boolean(fieldErrors.front || fieldErrors.question || fieldErrors.textWithClozes)} />
          {cardType === "cloze" ? <p className="core-body font-normal text-[var(--core-text-muted)]">Lücken mit <code>{"{{c1::Begriff}}"}</code> markieren.</p> : null}
          {fieldErrors.front || fieldErrors.question || fieldErrors.textWithClozes ? <p className="core-body font-medium text-core-text" role="alert">{fieldErrors.front || fieldErrors.question || fieldErrors.textWithClozes}</p> : null}
        </div>
        {cardType === "basic-with-images" ? (
          <ManualImageField
            label="Bild zur Vorderseite (optional)"
            value={frontImage}
            busy={preparingImage === "front"}
            error={imageErrors.front}
            onFile={(file) => void prepareImage("front", file)}
            onRemove={() => { setFrontImage(null); setImageErrors((current) => ({ ...current, front: "" })); }}
          />
        ) : null}
        <div data-manual-focus="back" className="grid min-w-0 gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <span>{answerLabel}</span>
            <PinFieldButton isPinned={pinnedFields.back} label={answerLabel} onToggle={() => togglePinnedField("back")} />
          </div>
          <RichTextEditor value={back} onFocus={() => setActiveField("back")} onChange={(value) => {
            dispatchBatch({ type: "draft", patch: { back: value } });
            setFieldErrors((current) => ({ ...current, back: undefined }));
          }} isActive={backFieldActive} minHeightClass="min-h-32" ariaLabel={answerLabel} ariaInvalid={Boolean(fieldErrors.back)} />
          {fieldErrors.back ? <p className="core-body font-medium text-core-text" role="alert">{fieldErrors.back}</p> : null}
        </div>
        {cardType === "basic-with-images" ? (
          <ManualImageField
            label="Bild zur Rückseite (optional)"
            value={backImage}
            busy={preparingImage === "back"}
            error={imageErrors.back}
            onFile={(file) => void prepareImage("back", file)}
            onRemove={() => { setBackImage(null); setImageErrors((current) => ({ ...current, back: "" })); }}
          />
        ) : null}
      </div>

      {cardType === "multiple-choice" ? (
        <fieldset className="grid gap-3 rounded-xl border border-[var(--core-border)] p-4">
          <legend className="px-1 core-body font-semibold text-[var(--core-text-secondary)]">Antwortoptionen und richtige Antwort</legend>
          {answerOptions.map((option, index) => (
            <div key={index} className="flex min-w-0 items-center gap-2">
              <input type="radio" name="manual-correct-option" checked={correctOptionIndex === index} onChange={() => {
                dispatchBatch({ type: "draft", patch: { correctOptionIndex: index } });
                setFieldErrors((current) => ({ ...current, correctOptionIndex: undefined }));
              }} aria-label={`Option ${index + 1} als richtig markieren`} aria-invalid={Boolean(fieldErrors.correctOptionIndex)} />
              <input data-manual-focus={index === 0 ? "option-0" : undefined} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--core-border)] px-3" value={option} onChange={(event) => updateAnswerOption(index, event.target.value)} placeholder={`Option ${index + 1}`} aria-label={`Antwortoption ${index + 1}`} aria-invalid={Boolean(fieldErrors.options)} />
              <IconButton type="button" icon={X} label={`Antwortoption ${index + 1} entfernen`} onClick={() => removeAnswerOption(index)} disabled={answerOptions.length <= 2} />
            </div>
          ))}
          <ActionButton type="button" variant="secondary" icon={Plus} onClick={() => dispatchBatch({ type: "draft", patch: { answerOptions: [...answerOptions, ""] } })} className="w-fit">Option hinzufügen</ActionButton>
          {fieldErrors.options ? <p className="core-body font-medium text-core-text" role="alert">{fieldErrors.options}</p> : null}
          {fieldErrors.correctOptionIndex ? <p className="core-body font-medium text-core-text" role="alert">{fieldErrors.correctOptionIndex}</p> : null}
        </fieldset>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
          Tags
          <input className="min-h-11 rounded-xl border border-[var(--core-border)] px-3" value={tags} onChange={(event) => dispatchBatch({ type: "draft", patch: { tags: event.target.value } })} placeholder="biologie zelle prüfung" />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <ActionButton type="button" variant="primary" icon={Database} disabled={Boolean(preparingImage)} onClick={() => void saveManualCard()}>Originalkarte speichern</ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            disabled={batchState.createdCount === 0}
            onClick={() => onFinish({
              createdCount: batchState.createdCount,
              targetDeckId: batchState.targetDeckId,
              lastSavedCardId: batchState.lastSavedCardId,
            })}
          >
            Fertig
          </ActionButton>
        </div>
      </div>
      <p className="core-body font-medium text-[var(--core-text-muted)]">{batchState.createdCount} {batchState.createdCount === 1 ? "Karte" : "Karten"} in dieser Sitzung erstellt.</p>
      {status ? <p className={`core-body ${statusType === "alert" ? "core-status-error" : "core-status-info"}`} role={statusType} aria-live="polite">{status}</p> : null}
    </div>
  );

  return (
    <SoftPanel className="min-h-[calc(100vh-15rem)] p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <OrbIcon icon={PenLine} className="bg-core-info-soft text-core-text" />
          <h2 className="core-heading-2 font-semibold text-[var(--core-text)]">Karte selbst erstellen</h2>
        </div>
        <button type="button" onClick={openSourcePicker} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-4 core-body font-semibold text-[var(--core-action-primary)] hover:bg-core-surface">
          <FileText size={17} aria-hidden="true" />
          {document ? "Quelle wechseln" : "PDF/Text anfügen"}
        </button>
        <input ref={sourceInputRef} className="sr-only" type="file" accept={workflow.readableSourceDocumentAccept} onChange={handleDocument} />
      </div>

      {showDocumentMode ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="grid content-start gap-4">
            <div className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
              <span>Quelle ({workflow.readableSourceDocumentLabel})</span>
              <button type="button" onClick={openSourcePicker} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--core-border)] px-3 text-left text-[var(--core-text-muted)] hover:border-[var(--core-border-interactive)] hover:bg-core-surface">
                <FileText className="shrink-0" size={17} aria-hidden="true" />
                <span className="shrink-0 rounded-lg bg-core-surface px-3 py-2 core-caption font-semibold text-[var(--core-action-primary)] shadow-sm">Datei auswählen</span>
                <span className="min-w-0 truncate core-body font-medium">{sourceFileName}</span>
              </button>
            </div>
            {document && !shouldShowPdfViewer ? (
              <div className="rounded-xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-3 core-body text-[var(--core-text-muted)]">
                <p className="font-semibold text-[var(--core-text)]">{document.fileName}</p>
                <p>{documentStatusMessage(document)}</p>
              </div>
            ) : null}
            {shouldShowPdfViewer && document ? (
              <PdfDocumentViewer document={document} src={documentObjectUrl} onSelection={applySelection} />
            ) : (
              <div className="max-h-[40rem] min-h-[40rem] overflow-auto rounded-xl border border-[var(--core-border)] bg-core-surface p-4 core-body leading-6 text-[var(--core-text)]" onMouseUp={captureSelection} onKeyUp={captureSelection} tabIndex={0}>
                {documentText ? <pre className="whitespace-pre-wrap break-words font-sans">{documentText}</pre> : <p className="text-[var(--core-text-muted)]">Keine Textquelle geöffnet.</p>}
              </div>
            )}
          </div>
          {editor}
        </div>
      ) : (
        editor
      )}
    </SoftPanel>
  );
}
