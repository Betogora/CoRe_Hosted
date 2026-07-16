import React from "react";
import { Database, FileText, PenLine, Pin, PinOff, Plus, X } from "lucide-react";
import type { CreationWorkflow } from "../creationWorkflow.ts";
import type { CardEditorFieldErrors, CardType, Deck, SourceAnchor, SourceDocument } from "../coreTypes.ts";
import { OrbIcon, SoftPanel } from "../ui/coreUi.tsx";
import { PdfDocumentViewer } from "../ui/PdfDocumentViewer.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";
import { cardTypeOptions } from "./screenConstants.ts";

type ManualCreationWorkflow = Pick<
  CreationWorkflow,
  | "captureManualSelection"
  | "createManualDeck"
  | "createManualDeckInput"
  | "validateManualCard"
  | "readableSourceDocumentAccept"
  | "readableSourceDocumentLabel"
  | "readSourceDocument"
>;
type ManualCreationInput = NonNullable<Parameters<ManualCreationWorkflow["createManualDeck"]>[0]>;
type ManualDeckInput = ReturnType<ManualCreationWorkflow["createManualDeckInput"]>;
type PdfSelectionOptions = Parameters<NonNullable<React.ComponentProps<typeof PdfDocumentViewer>["onSelection"]>>[1];
type ActiveField = "front" | "back";

export interface ManualCreationPanelProps {
  decks: Deck[];
  workflow: ManualCreationWorkflow;
  documentMode?: boolean;
  onCreated: (deck: Deck) => unknown;
  onAppendManualCard: (deckId: string, input: ManualDeckInput) => Promise<Deck | null>;
}

interface PinFieldButtonProps {
  isPinned: boolean;
  label: string;
  onToggle: () => void;
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
  const title = isPinned ? `${label} nach dem Speichern leeren` : `${label} nach dem Speichern behalten`;

  return (
    <button
      type="button"
      aria-label={title}
      aria-pressed={isPinned}
      title={title}
      onClick={onToggle}
      className={`grid size-8 shrink-0 place-items-center rounded-lg border transition ${
        isPinned
          ? "border-[#8c96dc] bg-[#eef1fb] text-[#4f5eb1] shadow-[0_0_0_2px_rgba(79,94,177,0.10)]"
          : "border-[#dfe4f5] bg-white text-[#8a94bd] hover:border-[#8c96dc] hover:text-[#4f5eb1]"
      }`}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

export function ManualCreationPanel({ decks, workflow, onCreated, onAppendManualCard, documentMode = false }: ManualCreationPanelProps) {
  const sourceInputRef = React.useRef<HTMLInputElement | null>(null);
  const editorRootRef = React.useRef<HTMLDivElement | null>(null);
  const [useNewDeck, setUseNewDeck] = React.useState(decks.length === 0);
  const [selectedDeckId, setSelectedDeckId] = React.useState(decks[0]?.id ?? "");
  const [deckName, setDeckName] = React.useState("Manueller Kartenstapel");
  const [cardType, setCardType] = React.useState<CardType>("basic");
  const [front, setFront] = React.useState("");
  const [back, setBack] = React.useState("");
  const [answerOptions, setAnswerOptions] = React.useState(["", ""]);
  const [correctOptionIndex, setCorrectOptionIndex] = React.useState(0);
  const [tags, setTags] = React.useState("");
  const [pinnedFields, setPinnedFields] = React.useState<Record<ActiveField, boolean>>({ front: false, back: false });
  const [activeField, setActiveField] = React.useState<ActiveField>("front");
  const [showDocumentMode, setShowDocumentMode] = React.useState(documentMode);
  const [document, setDocument] = React.useState<SourceDocument | null>(null);
  const [documentObjectUrl, setDocumentObjectUrl] = React.useState("");
  const [documentText, setDocumentText] = React.useState("");
  const [selection, setSelection] = React.useState("");
  const [sourceAnchor, setSourceAnchor] = React.useState<SourceAnchor | null>(null);
  const [status, setStatus] = React.useState("");
  const [statusType, setStatusType] = React.useState<"status" | "alert">("status");
  const [fieldErrors, setFieldErrors] = React.useState<CardEditorFieldErrors>({});

  React.useEffect(() => {
    if (!selectedDeckId && decks[0]?.id) setSelectedDeckId(decks[0].id);
    if (selectedDeckId && !decks.some((deck) => deck.id === selectedDeckId)) setSelectedDeckId(decks[0]?.id ?? "");
    if (decks.length === 0) setUseNewDeck(true);
  }, [decks, selectedDeckId]);

  React.useEffect(() => {
    setShowDocumentMode(documentMode);
  }, [documentMode]);

  React.useEffect(() => {
    if (correctOptionIndex >= answerOptions.length) setCorrectOptionIndex(0);
  }, [answerOptions.length, correctOptionIndex]);

  React.useEffect(
    () => () => {
      if (documentObjectUrl) URL.revokeObjectURL(documentObjectUrl);
    },
    [documentObjectUrl],
  );

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
    setSelection(next.selection);
    setSourceAnchor(next.sourceAnchor ?? null);
    setFront(next.front);
    setBack(next.back);
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
    };
  }

  function togglePinnedField(field: ActiveField) {
    setPinnedFields((current) => ({ ...current, [field]: !current[field] }));
  }

  function updateAnswerOption(index: number, value: string) {
    setAnswerOptions((current) => current.map((option, optionIndex) => optionIndex === index ? value : option));
    setFieldErrors((current) => ({ ...current, options: undefined }));
  }

  function removeAnswerOption(index: number) {
    if (answerOptions.length <= 2) return;
    setAnswerOptions((current) => current.filter((_, optionIndex) => optionIndex !== index));
    setCorrectOptionIndex((current) => current === index ? 0 : current > index ? current - 1 : current);
    setFieldErrors((current) => ({ ...current, options: undefined, correctOptionIndex: undefined }));
  }

  function resetCardFields() {
    const keepSourceAnchor = sourceAnchor?.targetField === "front" || sourceAnchor?.targetField === "back"
      ? pinnedFields[sourceAnchor.targetField]
      : false;
    setFront((current) => (pinnedFields.front ? current : ""));
    setBack((current) => (pinnedFields.back ? current : ""));
    setAnswerOptions(["", ""]);
    setCorrectOptionIndex(0);
    setFieldErrors({});
    if (!keepSourceAnchor) {
      setSelection("");
      setSourceAnchor(null);
    }
    setActiveField(pinnedFields.front && !pinnedFields.back ? "back" : "front");
  }

  async function saveManualCard() {
    const validation = workflow.validateManualCard(manualInput());
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      setStatusType("alert");
      setStatus("Bitte die markierten Felder prüfen.");
      return;
    }
    try {
      const input = manualInput();
      if (!useNewDeck && selectedDeckId) {
        const updatedDeck = await onAppendManualCard(selectedDeckId, workflow.createManualDeckInput(input));
        if (updatedDeck) {
          setStatusType("status");
          setStatus("Karte im ausgewählten Stapel gespeichert. Nächste Karte kann eingegeben werden.");
          resetCardFields();
          window.requestAnimationFrame(() => editorRootRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus());
        }
        return;
      }

      const deck = workflow.createManualDeck(input);
      await onCreated(deck);
      setUseNewDeck(false);
      setSelectedDeckId(deck.id);
      setStatusType("status");
      setStatus("Neuer Stapel mit Originalkarte gespeichert. Nächste Karte kann eingegeben werden.");
      resetCardFields();
      window.requestAnimationFrame(() => editorRootRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus());
    } catch (error) {
      setStatusType("alert");
      setStatus(error instanceof Error ? error.message : "Karte konnte nicht gespeichert werden.");
    }
  }

  const answerLabel = cardType === "cloze" ? "Zusatzinfo" : cardType === "multiple-choice" ? "Erklärung (optional)" : "Rückseite";
  const frontFieldActive = activeField === "front";
  const backFieldActive = activeField === "back";
  const shouldShowPdfViewer = showDocumentMode && isPdfDocument(document) && Boolean(documentObjectUrl);
  const panelEyebrow = showDocumentMode ? "Manuelle Erstellung mit Quelle" : "Manuelle Erstellung";
  const sourceFileName = document?.fileName ?? "Keine Datei ausgewählt";

  const editor = (
    <div ref={editorRootRef} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {!useNewDeck && decks.length > 0 ? (
              <label className="grid min-w-[16rem] flex-1 gap-2 text-sm font-semibold text-[#4e5b8c]">
                Kartenstapel
                <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={selectedDeckId} onChange={(event) => setSelectedDeckId(event.target.value)}>
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {(deck.hierarchyPath.length ? deck.hierarchyPath : [deck.name]).join(" / ")}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="grid min-w-[16rem] flex-1 gap-2 text-sm font-semibold text-[#4e5b8c]">
                Neuer Kartenstapel
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
              </label>
            )}
            <button type="button" onClick={() => setUseNewDeck((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
              <Database size={16} aria-hidden="true" />
              {useNewDeck && decks.length > 0 ? "Stapel auswählen" : "Neuen Stapel erstellen"}
            </button>
          </div>
        </div>

        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Kartentyp
          <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={cardType} onChange={(event) => setCardType(event.target.value as CardType)}>
            {cardTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid min-w-0 gap-4">
        <div className="grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
          <div className="flex min-h-9 items-center justify-between gap-2">
            <span>{cardType === "cloze" ? "Cloze-Text" : cardType === "multiple-choice" ? "Frage" : "Vorderseite"}</span>
            <PinFieldButton isPinned={pinnedFields.front} label={cardType === "cloze" ? "Cloze-Text" : cardType === "multiple-choice" ? "Frage" : "Vorderseite"} onToggle={() => togglePinnedField("front")} />
          </div>
          <RichTextEditor value={front} onFocus={() => setActiveField("front")} onChange={(value) => {
            setFront(value);
            setFieldErrors((current) => ({ ...current, front: undefined, question: undefined, textWithClozes: undefined }));
          }} isActive={frontFieldActive} minHeightClass="min-h-32" ariaLabel={cardType === "cloze" ? "Cloze-Text" : cardType === "multiple-choice" ? "Multiple-Choice-Frage" : "Vorderseite"} ariaInvalid={Boolean(fieldErrors.front || fieldErrors.question || fieldErrors.textWithClozes)} />
          {cardType === "cloze" ? <p className="text-sm font-normal text-[#66709a]">Lücken mit <code>{"{{c1::Begriff}}"}</code> markieren.</p> : null}
          {fieldErrors.front || fieldErrors.question || fieldErrors.textWithClozes ? <p className="text-sm font-medium text-red-700" role="alert">{fieldErrors.front || fieldErrors.question || fieldErrors.textWithClozes}</p> : null}
        </div>
        <div className="grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
          <div className="flex min-h-9 items-center justify-between gap-2">
            <span>{answerLabel}</span>
            <PinFieldButton isPinned={pinnedFields.back} label={answerLabel} onToggle={() => togglePinnedField("back")} />
          </div>
          <RichTextEditor value={back} onFocus={() => setActiveField("back")} onChange={(value) => {
            setBack(value);
            setFieldErrors((current) => ({ ...current, back: undefined }));
          }} isActive={backFieldActive} minHeightClass="min-h-32" ariaLabel={answerLabel} ariaInvalid={Boolean(fieldErrors.back)} />
          {fieldErrors.back ? <p className="text-sm font-medium text-red-700" role="alert">{fieldErrors.back}</p> : null}
        </div>
      </div>

      {cardType === "multiple-choice" ? (
        <fieldset className="grid gap-3 rounded-xl border border-[#dfe4f5] p-4">
          <legend className="px-1 text-sm font-semibold text-[#4e5b8c]">Antwortoptionen und richtige Antwort</legend>
          {answerOptions.map((option, index) => (
            <div key={index} className="flex min-w-0 items-center gap-2">
              <input type="radio" name="manual-correct-option" checked={correctOptionIndex === index} onChange={() => {
                setCorrectOptionIndex(index);
                setFieldErrors((current) => ({ ...current, correctOptionIndex: undefined }));
              }} aria-label={`Option ${index + 1} als richtig markieren`} aria-invalid={Boolean(fieldErrors.correctOptionIndex)} />
              <input className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#dfe4f5] px-3" value={option} onChange={(event) => updateAnswerOption(index, event.target.value)} placeholder={`Option ${index + 1}`} aria-label={`Antwortoption ${index + 1}`} aria-invalid={Boolean(fieldErrors.options)} />
              <button type="button" onClick={() => removeAnswerOption(index)} disabled={answerOptions.length <= 2} className="grid size-10 place-items-center rounded-xl border border-[#dfe4f5] text-[#66709a] disabled:opacity-40" aria-label={`Antwortoption ${index + 1} entfernen`}><X size={16} aria-hidden="true" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setAnswerOptions((current) => [...current, ""])} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1]"><Plus size={16} aria-hidden="true" />Option hinzufügen</button>
          {fieldErrors.options ? <p className="text-sm font-medium text-red-700" role="alert">{fieldErrors.options}</p> : null}
          {fieldErrors.correctOptionIndex ? <p className="text-sm font-medium text-red-700" role="alert">{fieldErrors.correctOptionIndex}</p> : null}
        </fieldset>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Tags
          <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="biologie zelle prüfung" />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" onClick={() => void saveManualCard()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white">
            <Database size={17} aria-hidden="true" />
            Originalkarte speichern
          </button>
        </div>
      </div>
      {status ? <p className={`text-sm ${statusType === "alert" ? "core-status-error" : "core-status-success"}`} role={statusType}>{status}</p> : null}
    </div>
  );

  return (
    <SoftPanel className="min-h-[calc(100vh-15rem)] p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <OrbIcon icon={PenLine} className="bg-sky-50 text-sky-700" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">{panelEyebrow}</p>
            <h2 className="text-2xl font-semibold text-[#17214f]">Karten manuell erstellen</h2>
          </div>
        </div>
        <button type="button" onClick={openSourcePicker} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-4 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
          <FileText size={17} aria-hidden="true" />
          {document ? "Quelle wechseln" : "PDF/Text anfügen"}
        </button>
        <input ref={sourceInputRef} className="sr-only" type="file" accept={workflow.readableSourceDocumentAccept} onChange={handleDocument} />
      </div>

      {showDocumentMode ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="grid content-start gap-4">
            <div className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              <span>Quelle ({workflow.readableSourceDocumentLabel})</span>
              <button type="button" onClick={openSourcePicker} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#cfd6ed] px-3 text-left text-[#66709a] hover:border-[#8c96dc] hover:bg-white">
                <FileText className="shrink-0" size={17} aria-hidden="true" />
                <span className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#4f5eb1] shadow-sm">Datei auswählen</span>
                <span className="min-w-0 truncate text-sm font-medium">{sourceFileName}</span>
              </button>
            </div>
            {document && !shouldShowPdfViewer ? (
              <div className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-3 text-sm text-[#66709a]">
                <p className="font-semibold text-[#17214f]">{document.fileName}</p>
                <p>{documentStatusMessage(document)}</p>
              </div>
            ) : null}
            {shouldShowPdfViewer && document ? (
              <PdfDocumentViewer document={document} src={documentObjectUrl} onSelection={applySelection} />
            ) : (
              <div className="max-h-[40rem] min-h-[40rem] overflow-auto rounded-xl border border-[#dfe4f5] bg-white p-4 text-sm leading-6 text-[#17214f]" onMouseUp={captureSelection} onKeyUp={captureSelection} tabIndex={0}>
                {documentText ? <pre className="whitespace-pre-wrap break-words font-sans">{documentText}</pre> : <p className="text-[#66709a]">Keine Textquelle geöffnet.</p>}
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
