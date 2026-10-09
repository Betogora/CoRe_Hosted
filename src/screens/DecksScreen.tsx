import React from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, FileText, Layers, Minus, Network, NotebookPen, PanelsTopLeft, Play, PlusSquare, RotateCcw, Save, Search, Sparkles, Star, Trash2, CircleHelp, X } from "lucide-react";
import type { CardDraftGuard, DecksScreenProps } from "../appScreenProps.ts";
export type { DecksCardPage, DecksCardPageRequest } from "../appScreenProps.ts";
export type DecksScreenCardPageProps = Pick<DecksScreenProps, "cardPages" | "onRequestCardPage">;
import { addNoteField, canRemoveNoteField, noteBlocks, noteEditorValue, notePromptLabel, noteTextIndex, planNoteContentChange, removeNoteField, renameNoteField, setNoteReverse, setNoteTypeIn, validateNoteEditorValue, type AddableFieldRole, type NoteEditorErrors, type NoteEditorValue } from "../coreModel.ts";
import { classifyCardEligibility, createVariantReviewModel } from "../coreVariantService.ts";
import type { AiCardVariantSuccess } from "../aiCardVariantContract.ts";
import { collectDeckTreeIds } from "../coreWorkspace.ts";
import { getVisibleDeckDepth } from "../deckHierarchy.ts";
import { stripHtml } from "../htmlSafety.ts";
import { addLearningDays, getLearningDayKey, getLearningDayStartForKey } from "../learningDay.ts";
import { CARD_TABLE_PAGE_SIZE, createCardTableModel, createCardTableRow, DEFAULT_CARD_TABLE_SORT, type CardTableSort, type CardTableSortField } from "../libraryModel.ts";
import { catalogEntryFromCard, type NoteGraph } from "../workspaceReplica.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { useNoteMediaUrls } from "../ui/cardMedia.tsx";
import { CardPreviewDialog } from "../ui/CardPreviewDialog.tsx";
import { CardStudyStateControls } from "../ui/CardStudyStateControls.tsx";
import { CoreDatePicker } from "../ui/CoreDatePicker.tsx";
import { ActionDialog, CoreSegmentedControl, CoreSlidingTabs, EmptyState, SoftPanel } from "../ui/coreUi.tsx";
import { DeckOptionsMenu } from "../ui/DeckOptionsMenu.tsx";
import { DeckSummaryRow } from "../ui/DeckSummaryRow.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { NOTE_FIELD_ROLE_LABELS, NoteBlockControls } from "../ui/NoteBlockControls.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { formatLevelList, getStateValue, maturityStageLabels } from "./screenConstants.ts";
import { LearningAreaHeader } from "./LearningAreaHeader.tsx";
import type { Card, CardStudyStatePatch, CardVariant, Deck, Note, NoteContent } from "../coreTypes.ts";

interface PendingDetailAction {
  run: () => void;
}

const deckContentTabs = [
  { value: "cards", label: "Karteikarten", icon: PanelsTopLeft },
  { value: "notes", label: "Notizen", icon: NotebookPen },
  { value: "mind-map", label: "Mind Map", icon: Network },
  { value: "quiz", label: "Quiz", icon: CircleHelp },
  { value: "source", label: "Quelle", icon: FileText },
] as const;

function sameSort(left: CardTableSort, right: CardTableSort) {
  return left.field === right.field && left.direction === right.direction;
}

function normalizeCardQuery(value: string) {
  return value.trim().toLocaleLowerCase("de");
}

const CARD_SEARCH_DEBOUNCE_MS = 250;

function SortHeader({ field, label, sort, onChange }: {
  field: CardTableSortField;
  label: string;
  sort: CardTableSort;
  onChange: (field: CardTableSortField) => void;
}) {
  const active = sort.field === field;
  const rightAligned = field !== "sortField";
  const headerPadding = rightAligned ? "px-1" : "px-1 sm:px-3 md:px-4";
  const headerGap = rightAligned ? "gap-0.5" : "gap-1 sm:gap-2";
  const directionLabel = active && sort.direction === "desc" ? "absteigend" : "aufsteigend";
  const SortIcon = active && sort.direction === "desc" ? ArrowDown : ArrowUp;

  return (
    <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`min-w-0 ${headerPadding} ${rightAligned ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onChange(field)}
        className={`core-table-header-control flex w-full min-w-0 items-center ${headerGap} rounded-inset core-caption font-semibold text-core-muted hover:text-core-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)] ${rightAligned ? "justify-end" : ""}`}
        aria-label={`${label} ${directionLabel} sortieren`}
      >
        <span className="min-w-0 truncate">{label}</span>
        <SortIcon size={14} aria-hidden="true" className={`shrink-0 ${active ? "opacity-100" : "opacity-35"}`} />
      </button>
    </th>
  );
}

function FieldError({ errors, field }: { errors: NoteEditorErrors; field: string }) {
  const message = errors[field];
  return message ? <p className="core-body font-medium text-core-text" role="alert">{message}</p> : null;
}

function noteKindLabel(note: Note) {
  const interaction = note.content.interaction;
  if (interaction.kind === "cloze") return "Lückentext";
  if (interaction.kind === "image-occlusion") return "Bildverdeckung";
  if (interaction.kind === "choice") return interaction.mode === "single" ? "Single Choice" : interaction.mode === "multiple" ? "Multiple Choice" : "Kprim";
  return interaction.prompts.length > 1 ? "Frage und Antwort mit Rückrichtung" : "Frage und Antwort";
}

function removedCardsDescription(count: number) {
  return count === 1
    ? "Durch diese Änderung entfällt diese Karte samt ihrem Lernstand:"
    : `Durch diese Änderung entfallen ${count} Karten samt ihrem Lernstand:`;
}

type CardLabelOptions = { dayStartHour?: number; timeZone?: string };

const FIELD_ROLE_NAMES: Record<Note["content"]["fields"][number]["role"], string> = { ...NOTE_FIELD_ROLE_LABELS, prompt: "Frage", answer: "Antwort", note: "Notiz" };

/** Learning state of a card in the words of the card list: new, suspended or reviewed with its next due date. */
function cardStateLabel(card: Card, note: Note, options: CardLabelOptions) {
  if (card.status === "suspended") return "ausgesetzt";
  if (card.study.reps === 0) return "neu, ohne Lernstand";
  const { nextStudyLabel } = createCardTableRow(catalogEntryFromCard(card, note), options);
  return `${card.study.reps === 1 ? "1 Wiederholung" : `${card.study.reps} Wiederholungen`} · fällig ${nextStudyLabel}`;
}

/** Kind of the content and, with siblings, the card's position, e.g. „Lückentext · Lücke 2 von 3“. */
function cardHeaderLabel(note: Note, card: Card, count: number) {
  if (count < 2) return noteKindLabel(note);
  const label = notePromptLabel(note.content, card.promptKey);
  const position = /^(cloze|io):\d+$/.test(card.promptKey) ? `${label} von ${count}` : `${label} · ${count} Karten aus diesem Inhalt`;
  return `${noteKindLabel(note)} · ${position}`;
}

/** What saving the draft would do to the content's cards, or null when nothing beyond the text changes. */
function draftChangeSummary(graph: NoteGraph, plan: ReturnType<typeof planNoteContentChange>) {
  const parts: string[] = [];
  const labels = (cards: Card[], content: NoteContent) => cards.map((card) => notePromptLabel(content, card.promptKey)).join(", ");
  if (plan.newCards.length) parts.push(`${plan.newCards.length === 1 ? "1 neue Karte" : `${plan.newCards.length} neue Karten`} (${labels(plan.newCards, plan.note.content)})`);
  if (plan.removedCards.length) parts.push(`${plan.removedCards.length === 1 ? "1 Karte entfällt" : `${plan.removedCards.length} Karten entfallen`} (${labels(plan.removedCards, graph.note.content)})`);
  const outdated = outdatedVariantCount(graph, plan);
  if (outdated) parts.push(outdated === 1 ? "1 KI-Umformulierung wird veraltet" : `${outdated} KI-Umformulierungen werden veraltet`);
  return parts.length ? `Beim Speichern: ${parts.join(" · ")}.` : null;
}

function outdatedVariantCount(graph: NoteGraph, plan: ReturnType<typeof planNoteContentChange>) {
  const activeBefore = new Set(graph.cards.flatMap((card) => card.variants.filter((variant) => variant.isActive && !variant.deletedAt).map((variant) => variant.id)));
  return plan.keptCards.flatMap((card) => card.variants).filter((variant) => variant.meta.outdated === true && activeBefore.has(variant.id)).length;
}

interface DeckCardEditorProps {
  deck: Deck;
  graph: NoteGraph;
  cardId: string;
  now: string;
  dayStartHour?: number;
  timeZone?: string;
  mediaUrls?: Record<string, string>;
  onSaveNote: (graph: NoteGraph, content: NoteContent) => Promise<unknown>;
  onSetStudyState: (cardId: string, patch: CardStudyStatePatch) => unknown;
  onDuplicateNote: () => Promise<NoteGraph | null>;
  onDeleteNote: () => void;
  onRescheduleCards: DecksScreenProps["onRescheduleCards"];
  onGenerateVariant: (cardId: string) => Promise<AiCardVariantSuccess>;
  onSelectCard: (deckId: string, cardId: string) => void;
  deckName: (deckId: string) => string;
  onClose: () => void;
  onDraftStateChange: (guard: CardDraftGuard | null) => void;
  syncConflict: boolean;
}

function DeckCardEditor({ deck, graph, cardId, syncConflict, now, dayStartHour, timeZone, mediaUrls = {}, onSaveNote, onSetStudyState, onDuplicateNote, onDeleteNote, onRescheduleCards, onGenerateVariant, onSelectCard, deckName, onClose, onDraftStateChange }: DeckCardEditorProps) {
  const { note } = graph;
  const card = graph.cards.find((candidate) => candidate.id === cardId) ?? null;
  const [initialValue, contentKey] = React.useMemo(() => {
    const value = noteEditorValue(note);
    return [value, JSON.stringify([value, note.content.fields.map(({ id, name, role }) => [id, name, role]), note.content.interaction])] as const;
  }, [note]);
  const [form, setForm] = React.useState<NoteEditorValue>(initialValue);
  // Building blocks change the structure; field text stays in the form until both are saved together.
  const [structure, setStructure] = React.useState(note.content);
  const [savedForm, setSavedForm] = React.useState(contentKey);
  const [fieldErrors, setFieldErrors] = React.useState<NoteEditorErrors>({});
  const [saveStatus, setSaveStatus] = React.useState("");
  const [saveError, setSaveError] = React.useState(false);
  const [pendingRemoval, setPendingRemoval] = React.useState<{ content: NoteContent; cards: Card[]; outdated: number } | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const previewButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const setSuccessToast = useSuccessToast();
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDuplicating, setIsDuplicating] = React.useState(false);
  const [duplicateStatus, setDuplicateStatus] = React.useState("");
  const [duplicateError, setDuplicateError] = React.useState(false);
  const [variantStatus, setVariantStatus] = React.useState("");
  const [variantStatusWarning, setVariantStatusWarning] = React.useState(false);
  const [isGeneratingVariant, setIsGeneratingVariant] = React.useState(false);
  const learningDayOptions = React.useMemo(() => ({ dayStartHour, timeZone }), [dayStartHour, timeZone]);
  const dueDateKey = card?.study.dueAt ? getLearningDayKey(card.study.dueAt, learningDayOptions) ?? "" : "";
  const todayDateKey = getLearningDayKey(now, learningDayOptions) ?? "";
  const minimumDateKey = getLearningDayKey(addLearningDays(now, 1, learningDayOptions) ?? "", learningDayOptions) ?? "";
  const [rescheduleDate, setRescheduleDate] = React.useState(dueDateKey);
  const [rescheduleError, setRescheduleError] = React.useState("");
  const [isRescheduling, setIsRescheduling] = React.useState(false);
  const editorHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const saveDraftRef = React.useRef<() => Promise<boolean>>(async () => false);
  const serializedForm = React.useMemo(
    () => JSON.stringify([form, structure.fields.map(({ id, name, role }) => [id, name, role]), structure.interaction]),
    [form, structure],
  );
  const draftNote = React.useMemo(() => ({ ...note, content: structure }), [note, structure]);
  const blocks = noteBlocks(structure);
  const draftDirty = serializedForm !== savedForm;
  const focusDraft = React.useCallback(() => editorHeadingRef.current?.focus(), []);
  const variantReviewModel = React.useMemo(
    () => card ? createVariantReviewModel(card, deck.reviewEvents ?? [], { now }) : null,
    [card, deck.reviewEvents, now],
  );
  const eligibility = React.useMemo(() => card ? classifyCardEligibility(note, card, deck.deckSettings) : null, [card, deck.deckSettings, note]);
  const draftPlan = React.useMemo(() => {
    if (!draftDirty) return null;
    const validation = validateNoteEditorValue(draftNote, form);
    if (!validation.ok) return null;
    try {
      return planNoteContentChange(graph, validation.content);
    } catch {
      return null;
    }
  }, [draftDirty, draftNote, form, graph]);
  const draftSummary = draftPlan ? draftChangeSummary(graph, draftPlan) : null;
  // The preview shows the current draft; an invalid draft falls back to the saved content.
  const previewNote = React.useMemo(() => {
    const validation = validateNoteEditorValue(draftNote, form);
    return validation.ok ? { ...note, content: validation.content, contentRevision: note.contentRevision + (draftDirty ? 1 : 0) } : note;
  }, [draftDirty, draftNote, form, note]);

  React.useLayoutEffect(() => {
    setForm(initialValue);
    setStructure(note.content);
    setSavedForm(contentKey);
    setFieldErrors({});
    setSaveError(false);
    setVariantStatus("");
    setVariantStatusWarning(false);
  }, [note.id, contentKey]);

  React.useEffect(() => {
    setPreviewOpen(false);
    setSaveStatus("");
    setSaveError(false);
    setDuplicateStatus("");
    setDuplicateError(false);
    setRescheduleError("");
  }, [cardId]);

  React.useEffect(() => {
    setRescheduleDate(dueDateKey);
    setRescheduleError("");
  }, [cardId, dueDateKey]);

  React.useEffect(() => {
    onDraftStateChange(draftDirty ? { focus: focusDraft, save: () => saveDraftRef.current() } : null);
  }, [draftDirty, focusDraft, onDraftStateChange]);

  React.useEffect(() => () => onDraftStateChange(null), [onDraftStateChange]);

  if (!card) return null;

  const { maturity, readiness, coverage } = variantReviewModel!;
  const variants = (card.variants ?? []).filter((variant) => !variant.deletedAt);
  const hasOutdatedVariants = variants.some((variant) => variant.meta.outdated === true);
  const labelOptions = { dayStartHour, timeZone };
  const siblings = graph.cards.filter((candidate) => candidate.deletedAt === null);
  const interaction = note.content.interaction;
  const choiceMode = interaction.kind === "choice" ? interaction.mode : null;
  const options = form.options ?? [];
  const correctCount = options.filter((option) => option.correct).length;
  const canReschedule = Boolean(
    rescheduleDate
    && minimumDateKey
    && rescheduleDate >= minimumDateKey
    && rescheduleDate !== dueDateKey
  );

  function clearStatus() {
    setSaveStatus("");
    setSaveError(false);
    setSuccessToast("");
  }

  function changeStructure(next: NoteContent, addedFieldId?: string) {
    setStructure(next);
    if (addedFieldId) setForm((current) => ({ ...current, fields: { ...current.fields, [addedFieldId]: "" } }));
    clearStatus();
  }

  function addField(role: AddableFieldRole) {
    const added = addNoteField(structure, role);
    changeStructure(added.content, added.fieldId);
  }

  function removeField(fieldId: string) {
    changeStructure(removeNoteField(structure, fieldId));
    setForm((current) => ({ ...current, fields: Object.fromEntries(Object.entries(current.fields).filter(([id]) => id !== fieldId)) }));
  }

  function updateField(fieldId: string, html: string) {
    setForm((current) => ({ ...current, fields: { ...current.fields, [fieldId]: html } }));
    setFieldErrors((current) => ({ ...current, [fieldId]: "", form: "" }));
    clearStatus();
  }

  function updateOptions(next: NoteEditorValue["options"]) {
    setForm((current) => ({ ...current, options: next }));
    setFieldErrors((current) => ({ ...current, options: "", form: "" }));
    clearStatus();
  }

  function addOption() {
    const ids = new Set(options.map((option) => option.id));
    let index = options.length + 1;
    while (ids.has(`option-${index}`)) index += 1;
    updateOptions([...options, { id: `option-${index}`, text: "", correct: false }]);
  }

  function correctnessLocked(index: number) {
    if (choiceMode !== "multiple") return false;
    const isCorrect = options[index].correct;
    return (isCorrect && correctCount === 1) || (!isCorrect && correctCount === options.length - 1);
  }

  function removeOption(index: number) {
    if (options.length <= 2 || correctnessLocked(index)) return;
    const next = options.filter((_, optionIndex) => optionIndex !== index);
    if (choiceMode === "single" && options[index].correct) next[0] = { ...next[0], correct: true };
    updateOptions(next);
  }

  function toggleCorrect(index: number) {
    if (choiceMode === "single") {
      updateOptions(options.map((option, optionIndex) => ({ ...option, correct: optionIndex === index })));
      return;
    }
    if (correctnessLocked(index)) return;
    updateOptions(options.map((option, optionIndex) => optionIndex === index ? { ...option, correct: !option.correct } : option));
  }

  async function persist(content: NoteContent, outdated = 0): Promise<boolean> {
    setIsSaving(true);
    setSaveError(false);
    setSaveStatus("Karte wird gespeichert …");
    try {
      await onSaveNote(graph, content);
      setSavedForm(serializedForm);
      onDraftStateChange(null);
      setFieldErrors({});
      setSaveStatus("");
      setSuccessToast(outdated === 0
        ? "Karte wurde erfolgreich gespeichert."
        : `Karte wurde erfolgreich gespeichert. ${outdated === 1 ? "1 KI-Umformulierung ist veraltet und wird nicht mehr abgefragt." : `${outdated} KI-Umformulierungen sind veraltet und werden nicht mehr abgefragt.`}`);
      return true;
    } catch {
      setSaveError(true);
      setSaveStatus("Karte ist lokal gespeichert, aber die Cloud-Synchronisierung ist fehlgeschlagen. Bitte später erneut versuchen.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function saveEditorValue(): Promise<boolean> {
    const validation = validateNoteEditorValue(draftNote, form);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      setSaveError(true);
      setSaveStatus(validation.errors.form ?? "Bitte die markierten Felder prüfen.");
      return false;
    }
    const plan = planNoteContentChange(graph, validation.content);
    if (!plan.changed) {
      setSavedForm(serializedForm);
      onDraftStateChange(null);
      setFieldErrors({});
      setSaveStatus("");
      return true;
    }
    const outdated = outdatedVariantCount(graph, plan);
    if (plan.removedCards.length > 0) {
      setPendingRemoval({ content: validation.content, cards: plan.removedCards, outdated });
      return false;
    }
    return persist(validation.content, outdated);
  }

  async function duplicateCard() {
    setIsDuplicating(true);
    setDuplicateStatus("Kopie wird erstellt …");
    setDuplicateError(false);
    try {
      const result = await onDuplicateNote();
      if (result) {
        setDuplicateStatus("");
        setSuccessToast("Kopie wurde erfolgreich direkt unter der Ausgangskarte erstellt.");
      } else {
        setDuplicateError(true);
        setDuplicateStatus("Die Karte konnte nicht kopiert werden.");
      }
    } catch {
      setDuplicateError(true);
      setDuplicateStatus("Die Kopie ist lokal erstellt; die Cloud-Synchronisierung steht noch aus.");
    } finally {
      setIsDuplicating(false);
    }
  }

  async function generateVariant() {
    if (!card || !eligibility?.eligible || isGeneratingVariant) return;
    setSuccessToast("");
    setIsGeneratingVariant(true);
    setVariantStatusWarning(false);
    setVariantStatus("KI-Variante wird erzeugt …");
    try {
      const result = await onGenerateVariant(card.id);
      const usedFallback = result.privacyMode === "non_zdr";
      setVariantStatusWarning(usedFallback);
      if (usedFallback) {
        setVariantStatus("KI-Variante erstellt. Da kein passendes ZDR-Modell verfügbar war, wurde ein kostenloses Modell ohne Zero Data Retention verwendet.");
      } else {
        setVariantStatus("");
        setSuccessToast(hasOutdatedVariants ? "Veraltete KI-Umformulierung wurde ersetzt." : "KI-Variante wurde erfolgreich erstellt.");
      }
    } catch (error) {
      setVariantStatusWarning(true);
      setVariantStatus(error instanceof Error ? error.message : "Die KI-Variante konnte nicht erstellt werden.");
    } finally {
      setIsGeneratingVariant(false);
    }
  }

  async function rescheduleCard() {
    const dueAt = getLearningDayStartForKey(rescheduleDate, learningDayOptions);
    if (!card || !dueAt || rescheduleDate < minimumDateKey || rescheduleDate === dueDateKey || isRescheduling) return;
    setRescheduleError("");
    setSuccessToast("");
    setIsRescheduling(true);
    let result: unknown = null;
    try {
      result = await onRescheduleCards([card.id], dueAt.toISOString(), new Date(now).toISOString());
    } catch {
      result = null;
    } finally {
      setIsRescheduling(false);
    }
    if (!Array.isArray(result) || result.length !== 1) {
      setRescheduleError("Die nächste Fälligkeit konnte nicht neu geplant werden.");
      return;
    }
    setSuccessToast("Die nächste Fälligkeit wurde erfolgreich neu geplant.");
  }

  saveDraftRef.current = saveEditorValue;

  return (
    <SoftPanel
      data-testid="card-detail-editor"
      className="min-h-full rounded-none border-0 p-6 shadow-none sm:p-6"
      style={card.status === "suspended" ? { backgroundColor: "var(--core-warning-surface)" } : undefined}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 ref={editorHeadingRef} tabIndex={-1} className="break-words core-heading-3 font-semibold text-core-text outline-none">Karte bearbeiten</h2>
          <p className="mt-1 core-caption text-core-muted" data-testid="card-sibling-position">{cardHeaderLabel(note, card, siblings.length)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <IconButton label="Detailansicht schließen" icon={X} onClick={onClose} />
          <button type="button" onClick={() => void saveEditorValue()} disabled={isSaving} className="core-action-primary">
            <Save size={16} aria-hidden="true" />
            {isSaving ? "Speichert …" : "Speichern"}
          </button>
          <ActionButton
            ref={previewButtonRef}
            type="button"
            variant="secondary"
            icon={Eye}
            onClick={() => setPreviewOpen(true)}
          >
            Vorschau
          </ActionButton>
          <button
            type="button"
            onClick={() => void duplicateCard()}
            disabled={isDuplicating}
            title="Eigenständige Kopie direkt unter dieser Karte erstellen"
            className="core-action-secondary"
          >
            <Copy size={16} aria-hidden="true" />
            {isDuplicating ? "Kopiert …" : "Kopieren"}
          </button>
          <button
            type="button"
            onClick={onDeleteNote}
            className="core-action-destructive"
          >
            <Trash2 size={16} aria-hidden="true" />
            Löschen
          </button>
        </div>
      </div>
      {syncConflict ? (
        <div className="mb-6 rounded-control border border-core-warning bg-core-warning-soft p-4 core-body text-core-text" role="status">
          <p className="font-semibold">Synchronisierung klären</p>
          <p className="mt-1">Diese Karte bleibt bis zur Konfliktentscheidung aus der Lernwarteschlange. Andere Karten sind nicht betroffen.</p>
        </div>
      ) : null}
      {siblings.length > 1 ? (
        <section className="mb-6 min-w-0 rounded-control border border-core-border bg-core-surface p-3" aria-labelledby={`card-siblings-${card.id}`} data-testid="card-siblings">
          <h3 id={`card-siblings-${card.id}`} className="core-body font-semibold text-core-text">Karten aus diesem Inhalt</h3>
          <ul className="mt-2 grid gap-1">
            {siblings.map((sibling) => {
              const current = sibling.id === card.id;
              const content = (
                <>
                  <span className="font-semibold text-core-text">{notePromptLabel(note.content, sibling.promptKey)}</span>
                  <span className="min-w-0 truncate text-core-muted">{deckName(sibling.deckId)} · {cardStateLabel(sibling, note, labelOptions)}</span>
                </>
              );
              return (
                <li key={sibling.id}>
                  {current ? (
                    <p className="flex min-h-10 min-w-0 flex-wrap items-center gap-x-2 rounded-inset bg-core-subtle px-3 core-body" aria-current="true">{content}</p>
                  ) : (
                    <button type="button" onClick={() => onSelectCard(sibling.deckId, sibling.id)} className="flex min-h-10 w-full min-w-0 flex-wrap items-center gap-x-2 rounded-inset px-3 text-left core-body transition-colors hover:bg-core-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-core-focus">{content}</button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <CardStudyStateControls
        className="mb-3"
        marked={note.marked}
        suspended={card.status === "suspended"}
        onMarkedChange={(marked) => onSetStudyState(card.id, { marked })}
        onSuspendedChange={(suspended) => onSetStudyState(card.id, { suspended })}
      />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rounded-control border border-core-border bg-core-surface p-3">
        <div className="core-field-group min-w-0 flex-1">
          <span className="core-field-label inline-flex items-center gap-2 font-semibold"><CalendarDays size={17} aria-hidden="true" />Nächste Fälligkeit</span>
          <CoreDatePicker
            id={`card-due-date-${card.id}`}
            ariaLabel="Nächste Fälligkeit"
            value={rescheduleDate}
            min={minimumDateKey}
            today={todayDateKey}
            onValueChange={(value) => {
              setRescheduleDate(value);
              setRescheduleError("");
            }}
            className="sm:max-w-64"
          />
        </div>
        <ActionButton type="button" variant="secondary" disabled={!canReschedule || isRescheduling} onClick={() => void rescheduleCard()}>
          {isRescheduling ? "Plant neu …" : "Neu planen"}
        </ActionButton>
        {rescheduleError ? <p className="core-status-error w-full core-body font-semibold" role="alert">{rescheduleError}</p> : null}
      </div>
      {draftSummary ? <p className="mb-4 rounded-control border border-core-border bg-core-subtle px-3 py-2 core-body text-core-text" role="status" aria-live="polite" data-testid="draft-change-summary">{draftSummary}</p> : null}
      {blocks.reverse !== null ? (
        <div className="mb-4 grid min-w-0 gap-2 sm:grid-cols-[max-content_max-content] sm:items-center sm:gap-3" data-testid="note-direction">
            <span className="core-body font-semibold text-core-text">Lernrichtung</span>
            <CoreSegmentedControl
              ariaLabel="Lernrichtung"
              options={[{ value: "standard", label: "Standard" }, { value: "both", label: "Beide Richtungen" }]}
              value={blocks.reverse ? "both" : "standard"}
              onValueChange={(value) => changeStructure(setNoteReverse(structure, value === "both"))}
            />
        </div>
      ) : null}
      <div className="grid min-w-0 gap-4">
        {structure.fields.map((field) => (
          <div key={field.id} className="grid min-w-0 gap-2 core-body font-semibold text-core-secondary">
            {canRemoveNoteField(structure, field.id) && field.id !== "front" && field.id !== "back" ? (
              <div className="flex min-w-0 items-end gap-2">
                <label className="grid min-w-0 flex-1 gap-1">
                  <span className="core-caption font-semibold text-core-muted">{FIELD_ROLE_NAMES[field.role]} · Feldname</span>
                  <input className="min-h-control min-w-0 rounded-control border border-core-border px-3" value={field.name} onChange={(event) => changeStructure(renameNoteField(structure, field.id, event.target.value))} aria-label={`Name von ${field.name}`} />
                </label>
                <IconButton label={`${field.name} entfernen`} icon={X} onClick={() => removeField(field.id)} />
              </div>
            ) : (
              <span>{field.name}</span>
            )}
            <RichTextEditor
              value={form.fields[field.id] ?? ""}
              onChange={(value) => updateField(field.id, value)}
              ariaLabel={`Feld ${field.name}`}
              ariaInvalid={Boolean(fieldErrors[field.id])}
              minHeightClass={field.role === "prompt" || field.role === "answer" ? "min-h-32" : "min-h-28"}
            />
            {interaction.kind === "cloze" && field.role === "prompt" ? (
              <p className="core-body font-normal text-core-muted">Lücken mit <code>{"{{c1::Begriff}}"}</code> markieren. Gleiche Nummern gehören zu einer Karte.</p>
            ) : null}
            <FieldError errors={fieldErrors} field={field.id} />
          </div>
        ))}
        {choiceMode ? (
          <fieldset className="grid gap-3 rounded-control border border-core-border p-4">
            <legend className="px-1 core-body font-semibold text-core-secondary">Antwortoptionen und {choiceMode === "single" ? "richtige Antwort" : "richtige Antworten"}</legend>
            {options.map((option, index) => (
              <div key={option.id} className="flex min-w-0 items-center gap-2">
                <input type={choiceMode === "single" ? "radio" : "checkbox"} name={choiceMode === "single" ? `correct-option-${note.id}` : undefined} checked={option.correct} disabled={correctnessLocked(index)} onChange={() => toggleCorrect(index)} aria-label={`Option ${index + 1} als richtig markieren`} />
                <input className="min-h-control min-w-0 flex-1 rounded-control border border-core-border px-3" value={option.text} onChange={(event) => updateOptions(options.map((candidate, optionIndex) => optionIndex === index ? { ...candidate, text: event.target.value } : candidate))} aria-label={`Antwortoption ${index + 1}`} aria-invalid={Boolean(fieldErrors.options)} />
                <button type="button" onClick={() => removeOption(index)} disabled={options.length <= 2 || correctnessLocked(index)} className="grid size-control place-items-center rounded-control border border-core-border text-core-muted disabled:opacity-40" aria-label={`Antwortoption ${index + 1} entfernen`}><X size={16} aria-hidden="true" /></button>
              </div>
            ))}
            {choiceMode !== "kprim" ? <button type="button" onClick={addOption} className="inline-flex min-h-control w-fit items-center gap-2 rounded-control border border-core-border px-3 core-body font-semibold text-core-action"><PlusSquare size={16} aria-hidden="true" />Option hinzufügen</button> : null}
            <FieldError errors={fieldErrors} field="options" />
          </fieldset>
        ) : null}
        <NoteBlockControls
          typeIn={blocks.typeIn}
          fieldRoles={blocks.fieldRoles}
          onTypeInChange={(enabled) => changeStructure(setNoteTypeIn(structure, enabled))}
          onAddField={addField}
        />
        <label className="grid gap-2 core-body font-semibold text-core-secondary">
          Tags
          <input className="min-h-control min-w-0 rounded-control border border-core-border px-3" value={form.tags.join(" ")} onChange={(event) => { setForm((current) => ({ ...current, tags: event.target.value.split(/\s+/).filter(Boolean) })); clearStatus(); }} />
        </label>
        {saveStatus ? <p className={saveError ? "core-status-error" : "core-status-info"} role={saveError ? "alert" : "status"}>{saveStatus}</p> : null}
        {duplicateStatus ? <p className={duplicateError ? "core-status-error" : "core-status-info"} role={duplicateError ? "alert" : "status"}>{duplicateStatus}</p> : null}
      </div>
      <section className="mt-6 min-w-0" aria-labelledby={`card-variants-${card.id}`} data-testid="card-variant-tools">
        <h3 id={`card-variants-${card.id}`} className="core-body-large font-semibold text-core-text">Varianten und Lernwerte</h3>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        <div className="min-w-0 rounded-control border border-core-border bg-core-surface p-4">
          <p className="core-caption font-semibold text-core-muted">Reifegrad</p>
          <p className="mt-2 break-words core-body-large font-semibold text-core-text">{(maturityStageLabels as Record<string, string>)[maturity.stage] ?? maturity.label}</p>
          <p className="mt-1 core-body text-core-muted">Score {maturity.score} · {maturity.description}</p>
          <p className="mt-2 core-caption text-core-muted">Stability {getStateValue(card.study, "stability")} · Difficulty {getStateValue(card.study, "difficulty")} · Reps {getStateValue(card.study, "reps")}</p>
        </div>
        <div className="min-w-0 rounded-control border border-core-border bg-core-surface p-4">
          <p className="core-caption font-semibold text-core-muted">Variantenbereitschaft</p>
          <p className="mt-2 break-words core-body-large font-semibold text-core-text">{formatLevelList(readiness.allowedLevels)}</p>
          <p className="mt-1 break-words core-body text-core-muted">Bevorzugt Level {readiness.preferredLevel}. {readiness.reason}</p>
        </div>
        <div className="min-w-0 rounded-control border border-core-border bg-core-surface p-4">
          <p className="core-caption font-semibold text-core-muted">Variantenabdeckung</p>
          <p className="mt-2 break-words core-body-large font-semibold text-core-text">{coverage.activeRephraseCount} nahe Varianten</p>
          <p className="mt-1 break-words core-body text-core-muted">{coverage.hasEnoughVariants ? "Genug Varianten vorhanden." : "Weitere nahe Umformulierungen möglich."}</p>
        </div>
        </div>
        <div className="mt-6 min-w-0 rounded-control border border-core-border bg-core-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="core-caption font-semibold text-core-muted">Varianten dieser Grundkarte</p>
            <p className="mt-1 break-words core-body text-core-muted">Varianten sind Umformulierungen derselben Wissenseinheit; der Hauptfortschritt bleibt auf der Grundkarte.</p>
          </div>
          <span className="rounded-control bg-core-subtle px-3 py-1 core-caption font-semibold text-core-action">{variants.length} Formen</span>
        </div>
        <div className="mt-4 grid gap-3">
          {variants.map((variant: CardVariant) => (
              <article key={variant.id} className="min-w-0 rounded-control border border-core-border bg-core-subtle p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 core-caption font-semibold text-core-muted">
                  <span className="rounded-inset bg-core-surface px-2 py-1">KI-Umformulierung</span>
                  <span>Level {variant.variantLevel}</span>
                  {variant.meta.outdated === true
                    ? <span className="rounded-inset bg-core-warning-soft px-2 py-1 text-core-text">veraltet</span>
                    : <span>{variant.isActive === false || variant.qualityStatus !== "active" ? "inaktiv" : "aktiv"}</span>}
                </div>
                <p className="break-words core-body font-semibold text-core-text">{stripHtml(variant.front)}</p>
                <p className="mt-1 break-words core-body text-core-muted">{stripHtml(variant.back)}</p>
                {variant.meta.outdated === true ? <p className="mt-2 core-caption text-core-muted">Frage oder Antwort wurden geändert; diese Umformulierung wird nicht mehr abgefragt.</p> : null}
                <p className="mt-2 core-caption text-core-muted">Attempts {variant.performance?.attempts ?? 0} · Richtig {variant.performance?.correctCount ?? 0} · Falsch {variant.performance?.wrongCount ?? 0}</p>
              </article>
          ))}
        </div>
        <div className="mt-4 grid gap-3 border-t border-core-border pt-4">
          <p className="core-body font-semibold text-core-text">Nahe KI-Umformulierung hinzufügen</p>
          <p className="core-body text-core-muted">Prüfe dieselbe Wissenseinheit. Keine neuen Fakten, keine neuen Konzepte.</p>
          <div className="flex flex-wrap items-center gap-3 rounded-control border border-core-border bg-core-subtle p-3">
            <ActionButton
              type="button"
              variant="secondary"
              icon={Sparkles}
              loading={isGeneratingVariant}
              disabled={!eligibility?.eligible || isGeneratingVariant}
              onClick={() => void generateVariant()}
            >
              {hasOutdatedVariants ? "KI-Variante neu erzeugen" : "KI-Variante erzeugen"}
            </ActionButton>
            <p className="min-w-0 flex-1 core-caption text-core-muted">
              {eligibility?.eligible
                ? "Sendet ausschließlich den bereinigten Text von Frage und Antwort an OpenRouter. ZDR wird bevorzugt; ein kostenloser Non-ZDR-Fallback ist möglich."
                : eligibility?.reasons[0] ?? "KI-Varianten sind für diese Karte nicht verfügbar."}
            </p>
          </div>
          {variantStatus ? <p className={`core-body ${variantStatusWarning ? "text-core-warning" : "text-core-muted"}`} role="status" aria-live="polite">{variantStatus}</p> : null}
        </div>
        </div>
      </section>
      <CardPreviewDialog
        open={previewOpen}
        note={previewNote}
        card={card}
        mediaUrls={mediaUrls}
        onOpenChange={setPreviewOpen}
        returnFocusRef={previewButtonRef}
      />
      <ActionDialog
        open={Boolean(pendingRemoval)}
        title="Karten entfernen?"
        description={pendingRemoval ? (
          <>
            <p>{removedCardsDescription(pendingRemoval.cards.length)}</p>
            <ul className="mt-3 grid gap-1.5" data-testid="removed-cards">
              {pendingRemoval.cards.map((removed) => (
                <li key={removed.id} className="core-body"><span className="font-semibold text-core-text">{notePromptLabel(note.content, removed.promptKey)}</span> · {deckName(removed.deckId)} · {cardStateLabel(removed, note, labelOptions)}</li>
              ))}
            </ul>
          </>
        ) : null}
        confirmLabel="Speichern"
        cancelLabel="Weiter bearbeiten"
        confirmLoading={isSaving}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          const removal = pendingRemoval;
          if (!removal) return;
          void persist(removal.content, removal.outdated).then(() => setPendingRemoval(null));
        }}
      />
    </SoftPanel>
  );
}

export function DecksScreen({
  decks,
  deckSummaries,
  onStartDeck,
  contentDeckId = null,
  now,
  dayStartHour,
  learnAheadMinutes,
  timeZone,
  mediaStore,
  selectedDeckId: focusedDeckId = null,
  selectedCardId = null,
  onSelectDeck,
  onCloseSelectedCard,
  onSetDeckCoreMode,
  onSaveNote,
  onSetCardStudyState,
  onDuplicateNote,
  onDeleteNote,
  onUndoDeleteNote,
  onRescheduleCards,
  onGenerateVariant,
  onMoveDeck,
  onOpenLearn,
  onOpenCardSettings,
  onOpenDeckSettings,
  onDraftStateChange,
  expandedDeckIds,
  onSetDeckExpanded,
  cardPages,
  onRequestCardPage,
  syncConflictCardIds,
}: DecksScreenProps) {
  const [contentTab, setContentTab] = React.useState<typeof deckContentTabs[number]["value"]>("cards");
  const libraryDecks = React.useMemo(() => {
    if (!contentDeckId) return decks;
    const treeIds = collectDeckTreeIds(decks, contentDeckId);
    return decks.filter((deck) => treeIds.has(deck.id));
  }, [contentDeckId, decks]);
  const contentDeck = contentDeckId ? libraryDecks.find((deck) => deck.id === contentDeckId) : null;
  const hasStudyCards = React.useMemo(() => Boolean(contentDeckId) && libraryDecks.some((deck) => (
    !deck.deletedAt && ((deckSummaries?.get(deck.id)?.inventory.totalCards ?? 0) > 0 || deck.cards.some((card) => !card.deletedAt))
  )), [contentDeckId, deckSummaries, libraryDecks]);
  const selectedContentTab = deckContentTabs.find((tab) => tab.value === contentTab)!;
  const ContentIcon = selectedContentTab.icon;
  const [query, setQuery] = React.useState("");
  const [deferredQuery, setDeferredQuery] = React.useState("");
  React.useEffect(() => {
    if (query === deferredQuery) return;
    const timer = window.setTimeout(() => setDeferredQuery(query), CARD_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [deferredQuery, query]);
  const [cardPageByDeckId, setCardPageByDeckId] = React.useState<Record<string, number>>({});
  const [cardSort, setCardSort] = React.useState<CardTableSort>(DEFAULT_CARD_TABLE_SORT);
  const [deckStatus, setDeckStatus] = React.useState("");
  const [deckStatusType, setDeckStatusType] = React.useState<"status" | "alert">("status");
  const setSuccessToast = useSuccessToast();
  const [pendingCardDelete, setPendingCardDelete] = React.useState<{ deckId: string; cardId: string; graph: NoteGraph } | null>(null);
  const preserveToastForSelectionChange = React.useRef(false);
  const [deletingCard, setDeletingCard] = React.useState(false);
  const [deletedCardUndo, setDeletedCardUndo] = React.useState<{ deckId: string; cardId: string; undo: NoteGraph; deleted: NoteGraph; description: string } | null>(null);
  const [pendingDetailAction, setPendingDetailAction] = React.useState<PendingDetailAction | null>(null);
  const [savingPendingDraft, setSavingPendingDraft] = React.useState(false);
  const cardDraftGuardRef = React.useRef<CardDraftGuard | null>(null);
  const detailRef = React.useRef<HTMLElement | null>(null);
  const previouslySelectedCardId = React.useRef<string | null>(null);
  const autoExpandedSelectedDeckIdRef = React.useRef<string | null>(null);
  const usesCardPages = cardPages !== undefined || Boolean(onRequestCardPage);
  const tableModel = React.useMemo(() => {
    if (!usesCardPages) {
      return createCardTableModel(libraryDecks, { query: deferredQuery, cardSort, cardPageByDeckId, now, dayStartHour, learnAheadMinutes, timeZone, deckSummaries });
    }
    const originalDecks = new Map(libraryDecks.map((deck) => [deck.id, deck]));
    const baseModel = createCardTableModel(
      libraryDecks.map((deck) => ({ ...deck, cards: [] })),
      { now, dayStartHour, learnAheadMinutes, timeZone, deckSummaries },
    );
    const normalizedQuery = normalizeCardQuery(deferredQuery);
    const allGroups = baseModel.allGroups.map((group) => {
      const candidate = cardPages?.[group.id];
      const page = candidate && candidate.query === deferredQuery && sameSort(candidate.sort, cardSort) ? candidate : undefined;
      const pageSize = Math.max(1, Math.min(CARD_TABLE_PAGE_SIZE, Math.floor(page?.pageSize ?? CARD_TABLE_PAGE_SIZE)));
      const items = (page?.items ?? []).slice(0, pageSize);
      const totalCardCount = Math.max(items.length, Math.floor(page?.totalCount ?? (normalizedQuery ? 0 : deckSummaries?.get(group.id)?.inventory.totalCards ?? 0)));
      const pageCount = Math.max(1, Math.ceil(totalCardCount / pageSize));
      const currentPage = Math.min(Math.max(0, Math.floor(page?.page ?? cardPageByDeckId[group.id] ?? 0)), pageCount - 1);
      const deckMatches = Boolean(normalizedQuery) && normalizeCardQuery(group.path).includes(normalizedQuery);
      return {
        ...group,
        deck: originalDecks.get(group.id) ?? group.deck,
        cardRows: items.map((entry) => createCardTableRow(entry, { dayStartHour, timeZone })),
        totalCardCount,
        page: currentPage,
        pageCount,
        pageSize,
        deckMatches,
      };
    });
    const groups = allGroups.filter((group) => (
      !normalizedQuery
      || group.deckMatches
      || group.totalCardCount > 0
      || Boolean(onRequestCardPage && !cardPages?.[group.id])
    ));
    return {
      allGroups,
      groups,
      cardSort,
    };
  }, [cardPageByDeckId, cardPages, cardSort, dayStartHour, deckSummaries, libraryDecks, deferredQuery, learnAheadMinutes, now, onRequestCardPage, timeZone, usesCardPages]);
  const searchExpandsGroups = Boolean(deferredQuery.trim());
  const [expandedDeckIdSet, setExpandedDeckIdSet] = React.useState(() => new Set(expandedDeckIds));
  const [collapsedContentDeckIds, setCollapsedContentDeckIds] = React.useState(() => new Set<string>());
  const groupById = React.useMemo(() => new Map(tableModel.allGroups.map((group) => [group.id, group])), [tableModel.allGroups]);
  const deckNameById = React.useMemo(() => new Map(decks.map((deck) => [deck.id, deck.name])), [decks]);
  const selectedContentDeckId = React.useMemo(() => {
    if (!contentDeckId || !selectedCardId) return null;
    for (const group of tableModel.allGroups) {
      if (cardPages?.[group.id]?.selected?.cardId === selectedCardId) return group.id;
      if (group.cardRows.some((row) => row.id === selectedCardId)) return group.id;
    }
    return null;
  }, [cardPages, contentDeckId, selectedCardId, tableModel.allGroups]);
  const selectedDeckId = selectedContentDeckId ?? focusedDeckId;
  const selectedGroup = selectedDeckId ? groupById.get(selectedDeckId) ?? null : null;
  const selectedDeck = selectedGroup?.deck ?? null;
  const selectedPage = selectedDeckId ? cardPages?.[selectedDeckId] : undefined;
  const selectedGraph = selectedPage?.selected?.cardId === selectedCardId ? selectedPage?.selected ?? null : null;
  const selectedDeckMissing = Boolean(selectedDeckId && !selectedDeck);
  const selectedCardMissing = Boolean(selectedDeck && selectedCardId && !selectedGraph);
  const detailOpen = Boolean(selectedGraph || selectedDeckMissing || selectedCardMissing);
  const { urls: selectedNoteMediaUrls } = useNoteMediaUrls(selectedGraph?.note.media, mediaStore);
  const handleEditorDraftStateChange = React.useCallback((guard: CardDraftGuard | null) => {
    cardDraftGuardRef.current = guard;
    onDraftStateChange(guard);
  }, [onDraftStateChange]);

  React.useEffect(() => {
    setExpandedDeckIdSet((current) => (
      current.size === expandedDeckIds.length && expandedDeckIds.every((deckId) => current.has(deckId))
        ? current
        : new Set(expandedDeckIds)
    ));
  }, [expandedDeckIds]);

  React.useEffect(() => {
    if (preserveToastForSelectionChange.current) {
      preserveToastForSelectionChange.current = false;
      return;
    }
    setSuccessToast("");
  }, [selectedCardId, setSuccessToast]);

  React.useEffect(() => {
    if (!onRequestCardPage) return;
    const requestedGroups = tableModel.allGroups.filter((group) => (
      Boolean(contentDeckId) || searchExpandsGroups || expandedDeckIdSet.has(group.id) || selectedDeckId === group.id
    ));
    for (const group of requestedGroups) {
      const page = Math.max(0, cardPageByDeckId[group.id] ?? cardPages?.[group.id]?.page ?? 0);
      const selectedCardForDeck = selectedDeckId === group.id ? selectedCardId : null;
      const current = cardPages?.[group.id];
      const hasSelectedCard = !selectedCardForDeck || current?.selected?.cardId === selectedCardForDeck;
      if (current
        && current.page === page
        && current.query === deferredQuery
        && sameSort(current.sort, cardSort)
        && (hasSelectedCard || Boolean(current.loadError))) continue;
      void onRequestCardPage({
        deckId: group.id,
        page,
        pageSize: CARD_TABLE_PAGE_SIZE,
        query: deferredQuery,
        sort: cardSort,
        selectedCardId: selectedCardForDeck,
      });
    }
  }, [cardPageByDeckId, cardPages, cardSort, contentDeckId, deferredQuery, expandedDeckIdSet, onRequestCardPage, searchExpandsGroups, selectedCardId, selectedDeckId, tableModel.allGroups]);

  React.useEffect(() => {
    if (contentDeckId) return;
    if (!selectedDeckId) {
      autoExpandedSelectedDeckIdRef.current = null;
      return;
    }
    if (autoExpandedSelectedDeckIdRef.current === selectedDeckId) return;
    autoExpandedSelectedDeckIdRef.current = selectedDeckId;
    if (!expandedDeckIdSet.has(selectedDeckId)) setDeckCardsExpanded(selectedDeckId, true);
  }, [contentDeckId, expandedDeckIdSet, onSetDeckExpanded, selectedDeckId]);

  React.useEffect(() => {
    if (!detailOpen) return;
    previouslySelectedCardId.current = selectedCardId;
    const frame = window.requestAnimationFrame(() => detailRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [detailOpen, selectedCardId]);

  React.useEffect(() => {
    if (!detailOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || pendingDetailAction || pendingCardDelete) return;
      event.preventDefault();
      requestDetailAction(closeDetail);
    }

    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || detailRef.current?.contains(target)) return;
      if (target.closest('[data-card-preview-overlay="true"]')) return;
      if (pendingCardDelete && target.matches('[data-testid="action-dialog-backdrop"]')) {
        if (deletingCard) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        setPendingCardDelete(null);
      }
      if (target.closest('[role="dialog"], [data-radix-popper-content-wrapper]')) return;
      if (target.closest('[data-app-navigation="true"]')) return;
      if (target.closest('[data-card-row="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      requestDetailAction(closeDetail);
    }

    window.addEventListener("keydown", handleEscape);
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
    };
  }, [deletingCard, detailOpen, pendingCardDelete, pendingDetailAction, selectedCardId, selectedDeckId]);

  function focusCardRow(cardId: string | null, preventScroll = false) {
    window.requestAnimationFrame(() => {
      const target = cardId ? document.querySelector<HTMLElement>('[data-testid="deck-card-' + cardId + '"]') : null;
      (target ?? document.querySelector<HTMLElement>("[data-screen-heading]"))?.focus({ preventScroll });
    });
  }

  function closeDetail() {
    const cardId = previouslySelectedCardId.current ?? selectedCardId;
    if (onCloseSelectedCard) {
      onCloseSelectedCard();
      return;
    }
    onSelectDeck(selectedDeckId);
    focusCardRow(cardId);
  }

  function requestDetailAction(run: () => void) {
    if (cardDraftGuardRef.current) {
      setPendingDetailAction({ run });
      return;
    }
    run();
  }

  function requestCardSelection(deckId: string, cardId: string) {
    requestDetailAction(() => {
      if (selectedDeckId === deckId && selectedCardId === cardId) closeDetail();
      else onSelectDeck(deckId, cardId);
    });
  }

  async function savePendingDetailDraft() {
    const guard = cardDraftGuardRef.current;
    if (!pendingDetailAction || !guard) return;
    setSavingPendingDraft(true);
    try {
      if (!await guard.save()) return;
      const action = pendingDetailAction;
      setPendingDetailAction(null);
      action.run();
    } finally {
      setSavingPendingDraft(false);
    }
  }

  function discardPendingDetailDraft() {
    const action = pendingDetailAction;
    setPendingDetailAction(null);
    action?.run();
  }

  function changeSort(field: CardTableSortField) {
    setCardPageByDeckId({});
    setCardSort((current) => current.field === field
      ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
      : { field, direction: "asc" });
  }

  function toggleDeckCards(deckId: string) {
    setDeckCardsExpanded(deckId, contentDeckId ? collapsedContentDeckIds.has(deckId) : !expandedDeckIdSet.has(deckId));
  }

  function setDeckCardsExpanded(deckId: string, expanded: boolean) {
    if (contentDeckId) {
      setCollapsedContentDeckIds((current) => {
        const next = new Set(current);
        if (expanded) next.delete(deckId);
        else next.add(deckId);
        return next;
      });
      return;
    }
    setExpandedDeckIdSet((current) => {
      if (current.has(deckId) === expanded) return current;
      const next = new Set(current);
      if (expanded) next.add(deckId);
      else next.delete(deckId);
      return next;
    });
    onSetDeckExpanded("deck-manager", deckId, expanded);
  }

  function requestCardDelete() {
    if (!selectedDeck || !selectedGraph) return;
    setPendingCardDelete({ deckId: selectedDeck.id, cardId: selectedGraph.cardId, graph: selectedGraph });
  }

  async function confirmCardDelete() {
    if (!pendingCardDelete || deletingCard) return;
    const deletion = pendingCardDelete;
    const description = noteTextIndex(deletion.graph.note.content).sortText || "Karte ohne Vorderseitentext";
    const contentRegion = document.querySelector<HTMLElement>('section[aria-label="Seiteninhalt"]');
    const contentBounds = contentRegion?.getBoundingClientRect();
    const visibleDeckHeader = contentRegion && contentBounds
      ? Array.from(contentRegion.querySelectorAll<HTMLElement>('[data-testid^="deck-header-"]'))
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.bottom >= contentBounds.top && bounds.top <= contentBounds.bottom;
        })
        .sort((left, right) => Math.abs(left.getBoundingClientRect().top - contentBounds.top - contentBounds.height / 2)
          - Math.abs(right.getBoundingClientRect().top - contentBounds.top - contentBounds.height / 2))[0]
      : null;
    const visibleDeckHeaderTop = visibleDeckHeader?.getBoundingClientRect().top;
    setDeletingCard(true);
    setDeckStatus("");
    setSuccessToast("");
    try {
      const result = await onDeleteNote(deletion.graph);
      if (!result?.deleted.note.deletedAt) throw new Error("Löschung fehlgeschlagen.");
      setDeletedCardUndo({ deckId: deletion.deckId, cardId: deletion.cardId, undo: result.undo, deleted: result.deleted, description });
      setPendingCardDelete(null);
      preserveToastForSelectionChange.current = true;
      onSelectDeck(deletion.deckId);
      setSuccessToast(deletion.graph.cards.length > 1 ? `Inhalt mit ${deletion.graph.cards.length} Karten wurde erfolgreich gelöscht.` : "Karte wurde erfolgreich gelöscht.");
      if (contentRegion && visibleDeckHeader && visibleDeckHeaderTop !== undefined) {
        window.requestAnimationFrame(() => {
          if (visibleDeckHeader.isConnected) {
            contentRegion.scrollTop += visibleDeckHeader.getBoundingClientRect().top - visibleDeckHeaderTop;
          }
        });
      }
      focusCardRow(null, true);
    } catch (error) {
      setDeckStatus(error instanceof Error ? `Die Karte konnte nicht sicher gelöscht werden: ${error.message}` : "Die Karte konnte nicht sicher gelöscht werden.");
      setDeckStatusType("alert");
    } finally {
      setDeletingCard(false);
    }
  }

  async function undoCardDelete() {
    if (!deletedCardUndo) return;
    try {
      const result = await onUndoDeleteNote(deletedCardUndo.undo, deletedCardUndo.deleted);
      if (!result) throw new Error("Undo fehlgeschlagen.");
      onSelectDeck(deletedCardUndo.deckId, deletedCardUndo.cardId);
      setDeckStatus("");
      setDeckStatusType("status");
      setSuccessToast("Kartenlöschung wurde erfolgreich rückgängig gemacht.");
      setDeletedCardUndo(null);
    } catch {
      onSelectDeck(deletedCardUndo.deckId, deletedCardUndo.cardId);
      setDeckStatus("Kartenlöschung lokal rückgängig gemacht; die Cloud-Synchronisierung steht noch aus.");
      setDeckStatusType("alert");
      setDeletedCardUndo(null);
    }
  }

  function renderDetailLayer() {
    return (
      <>
        {!pendingDetailAction && !pendingCardDelete ? <div className="fixed inset-0 z-40 bg-[var(--core-backdrop)]" aria-hidden="true" data-testid="card-detail-backdrop" /> : null}
        <aside
          ref={detailRef}
          tabIndex={-1}
          aria-label="Kartendetail"
          data-testid="card-detail-aside"
          className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto border-l border-core-border bg-core-surface shadow-raised [scrollbar-gutter:stable] focus:outline-none lg:w-1/2"
        >
        {selectedDeckMissing ? (
          <div className="grid min-h-full place-items-center p-6">
            <EmptyState
              icon={Layers}
              title="Stapel nicht gefunden"
              body="Der verlinkte Stapel ist nicht mehr verfügbar."
              action={<div className="flex flex-wrap justify-center gap-2"><ActionButton type="button" variant="primary" onClick={() => onOpenLearn(null)}>Zu Lernen</ActionButton><ActionButton type="button" variant="secondary" onClick={() => onSelectDeck(null)}>Alle Karten</ActionButton></div>}
            />
          </div>
        ) : selectedCardMissing ? (
          <div className="grid min-h-full place-items-center p-6">
            <EmptyState
              icon={Layers}
              title={selectedPage?.loadError ? "Karte noch nicht geladen" : "Karte nicht gefunden"}
              body={selectedPage?.loadError ?? "Die verlinkte Karte ist in diesem Stapel nicht mehr verfügbar."}
              action={<div className="flex flex-wrap justify-center gap-2">
                {selectedPage?.loadError && selectedDeckId && onRequestCardPage ? (
                  <ActionButton type="button" variant="primary" onClick={() => onRequestCardPage({
                    deckId: selectedDeckId,
                    page: selectedPage.page,
                    pageSize: CARD_TABLE_PAGE_SIZE,
                    query: selectedPage.query,
                    sort: selectedPage.sort,
                    selectedCardId,
                  })}>Erneut laden</ActionButton>
                ) : null}
                <ActionButton type="button" variant="secondary" onClick={closeDetail}>Zur Kartenliste</ActionButton>
              </div>}
            />
          </div>
        ) : selectedDeck && selectedGraph ? (
          <DeckCardEditor
            deck={selectedDeck}
            graph={selectedGraph}
            cardId={selectedGraph.cardId}
            syncConflict={syncConflictCardIds?.has(selectedGraph.cardId) ?? false}
            now={now}
            dayStartHour={dayStartHour}
            timeZone={timeZone}
            mediaUrls={selectedNoteMediaUrls}
            onSaveNote={onSaveNote}
            onSetStudyState={(cardId, patch) => onSetCardStudyState(selectedDeck.id, cardId, patch)}
            onDuplicateNote={() => onDuplicateNote(selectedGraph)}
            onDeleteNote={requestCardDelete}
            onRescheduleCards={onRescheduleCards}
            onGenerateVariant={(cardId) => onGenerateVariant(selectedDeck.id, cardId)}
            onSelectCard={requestCardSelection}
            deckName={(deckId) => deckNameById.get(deckId) ?? "Unbekannter Stapel"}
            onClose={() => requestDetailAction(closeDetail)}
            onDraftStateChange={handleEditorDraftStateChange}
          />
        ) : null}
        </aside>
      </>
    );
  }

  return (
    <div className="relative grid min-w-0 gap-6">
      {contentDeckId ? (
        <>
          <h2 className="sr-only" data-screen-heading tabIndex={-1}>Stapelinhalte</h2>
          <CoreSlidingTabs ariaLabel="Stapelinhalte" options={deckContentTabs} value={contentTab} onValueChange={setContentTab} />
        </>
      ) : <LearningAreaHeader area="cards" onOpenCardSettings={onOpenCardSettings} onAreaChange={(area) => {
        if (area === "overview") onOpenLearn(selectedDeckId);
      }} />}

      {contentDeckId && contentTab !== "cards" ? (
        <SoftPanel aria-label={selectedContentTab.label} className="flex min-h-[214px] items-center justify-center p-6 sm:p-10">
          <div className="flex min-w-0 flex-col items-center gap-4 text-center" role="status">
            <span className="grid size-14 place-items-center rounded-panel bg-core-subtle text-core-muted"><ContentIcon size={28} strokeWidth={2} aria-hidden="true" /></span>
            <div>
              <h3 className="core-heading-3 text-core-text">{selectedContentTab.label}</h3>
              <p className="mt-1 core-body-large text-core-muted">Demnächst verfügbar</p>
            </div>
          </div>
        </SoftPanel>
      ) : <SoftPanel className="min-w-0 overflow-hidden p-4 sm:p-6" aria-labelledby={contentDeckId ? undefined : "card-library-heading"} aria-label={contentDeckId ? "Karteikarten" : undefined} data-testid="card-library-panel">
        <div className="grid gap-6">
          {!contentDeckId ? <h3 id="card-library-heading" className="flex min-h-control items-center whitespace-nowrap core-heading-3 font-semibold text-core-text">Aktive Stapel</h3> : null}
          <div className="grid gap-3">
            <div className={contentDeckId ? "grid min-w-0 grid-cols-[minmax(0,1fr)_44px] items-end gap-3" : "min-w-0"}>
              <label className="grid min-w-0 gap-2 core-body font-semibold text-core-secondary">
                Karten durchsuchen
                <span className="flex min-h-control min-w-0 items-center gap-2 rounded-control border border-core-border bg-core-surface px-3 font-normal text-core-muted transition">
                  <Search size={17} aria-hidden="true" />
                  <input className="min-w-0 flex-1 bg-transparent outline-none focus-visible:outline-none" value={query} onChange={(event) => { setQuery(event.target.value); setCardPageByDeckId({}); }} placeholder={contentDeckId ? "Vorderseite, Rückseite oder Tags suchen" : "Stapel, Vorderseite, Rückseite oder Tags suchen"} aria-label="Karten durchsuchen" />
                </span>
              </label>
              {contentDeck ? <CoreTooltip label={`${contentDeck.name} lernen`}>
                <IconButton
                  label={`${contentDeck.name} lernen`}
                  icon={Play}
                  variant="ghost"
                  className="core-deck-icon-action core-deck-content-study size-control"
                  disabled={!hasStudyCards}
                  onClick={() => requestDetailAction(() => onStartDeck(contentDeck))}
                />
              </CoreTooltip> : null}
            </div>
            {deckStatus ? <p className={"core-body font-semibold " + (deckStatusType === "alert" ? "core-status-error" : "core-status-info")} role={deckStatusType}>{deckStatus}</p> : null}
            {deletedCardUndo ? (
              <div className="flex flex-wrap items-center gap-3 rounded-control border border-core-border bg-core-subtle p-3">
                <p className="min-w-0 flex-1 truncate core-body text-core-text">„{deletedCardUndo.description}“ gelöscht.</p>
                <ActionButton type="button" variant="secondary" icon={RotateCcw} onClick={() => void undoCardDelete()}>Rückgängig</ActionButton>
              </div>
            ) : null}
          </div>

          {tableModel.groups.length ? (
            <div className="min-w-0 max-w-full overflow-hidden rounded-panel border border-core-border">
          <table className="w-full table-fixed border-collapse" data-testid="card-library-table">
              <colgroup>
                <col />
                <col className="w-20 sm:w-[5.75rem]" />
                <col className="w-20" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-core-surface">
                <tr className="core-table-header-row border-b border-core-border">
                  <SortHeader field="sortField" label="Sortierfeld" sort={cardSort} onChange={changeSort} />
                  <SortHeader field="nextStudyDate" label="Datum" sort={cardSort} onChange={changeSort} />
                  <SortHeader field="variants" label="Variante" sort={cardSort} onChange={changeSort} />
                </tr>
              </thead>
              {tableModel.groups.map((group) => {
                const expanded = searchExpandsGroups || (contentDeckId ? !collapsedContentDeckIds.has(group.id) : expandedDeckIdSet.has(group.id));
                const visibleDepth = getVisibleDeckDepth(group.depth);
                const groupLeadingControl = (
                  <span className="grid size-9 shrink-0 place-items-center text-core-action" aria-hidden="true">
                    {expanded ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                  </span>
                );
                const groupActions = (
                  <DeckOptionsMenu
                    row={group}
                    decks={decks}
                    onSetCoreMode={onSetDeckCoreMode}
                    onOpenSettings={onOpenDeckSettings}
                    onMoveDeck={onMoveDeck}
                  />
                );
                return (
                <tbody key={group.id} id={"deck-card-list-" + group.id} data-testid={"card-group-" + group.id}>
                  {!contentDeckId || libraryDecks.length > 1 ? <tr
                    data-testid={"deck-header-" + group.id}
                    data-deck-depth={visibleDepth}
                    className="core-deck-summary-row"
                    style={selectedDeckId === group.id ? { backgroundColor: "var(--core-info-surface)" } : undefined}
                  >
                    <th scope="rowgroup" colSpan={3} className="relative px-3 text-left">
                      <button
                        type="button"
                        data-testid={"deck-toggle-" + group.id}
                        aria-expanded={expanded}
                        aria-controls={"deck-card-list-" + group.id}
                        aria-label={expanded ? `Karten von ${group.path} einklappen` : `Karten von ${group.path} aufklappen`}
                        onClick={() => toggleDeckCards(group.id)}
                        data-deck-row-activation="true"
                        className="absolute inset-0 z-0 cursor-pointer transition-colors hover:bg-[var(--core-focus-ring-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-core-focus"
                      />
                      <DeckSummaryRow
                        row={group}
                        leadingControl={groupLeadingControl}
                        actions={groupActions}
                        density="responsive"
                      />
                    </th>
                  </tr> : null}
                  {expanded && cardPages?.[group.id]?.limitedToLocalCatalog ? (
                    <tr className="border-b border-core-border bg-core-warning-soft">
                      <td colSpan={3} className="px-4 py-2 core-caption text-core-secondary">
                        Offline werden nur bereits lokal indexierte Karten durchsucht und sortiert.
                      </td>
                    </tr>
                  ) : null}
                  {expanded && group.cardRows.length ? <>{group.cardRows.map(({ entry: card, frontPreview, nextStudyLabel, hasActiveVariants }) => {
                    const suspended = !card.reviewable;
                    const selected = selectedCardId === card.id;
                    const marked = selectedGraph?.note.id === card.noteId ? selectedGraph.note.marked : card.marked;
                    return (
                    <tr
                      key={card.id}
                      onClick={() => requestCardSelection(group.id, card.id)}
                      className={`cursor-pointer border-b border-core-border transition ${suspended ? "bg-core-warning-soft hover:bg-core-warning-soft" : selected ? "bg-core-info-soft hover:bg-core-subtle" : "bg-core-surface hover:bg-core-subtle"} ${selected ? "core-card-row-selected" : ""}`}
                      data-selected={selected ? "true" : undefined}
                      data-suspended={suspended ? "true" : undefined}
                      data-card-row="true"
                    >
                      <td className="min-w-0 px-2 py-1 align-middle sm:px-3 md:px-4">
                        <button
                          type="button"
                          data-testid={"deck-card-" + card.id}
                          aria-pressed={selectedCardId === card.id}
                          className="block !min-h-0 w-full truncate text-left core-body font-semibold text-core-text focus-visible:rounded-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)]"
                          onClick={(event) => {
                            event.stopPropagation();
                            requestCardSelection(group.id, card.id);
                          }}
                        >
                          {frontPreview}
                          {syncConflictCardIds?.has(card.id) ? <span className="ml-2 rounded-inset bg-core-warning-soft px-2 py-0.5 core-caption text-core-text">Synchronisierung klären</span> : null}
                        </button>
                      </td>
                      <td className="min-w-0 whitespace-nowrap px-1 py-1 text-right align-middle core-body text-core-secondary">
                        {nextStudyLabel}
                        {suspended ? <span className="sr-only"> · Ausgesetzt</span> : null}
                      </td>
                      <td className="min-w-0 px-1 py-1 text-right align-middle">
                        <span className="inline-flex items-center justify-end gap-1 align-middle">
                          {hasActiveVariants
                            ? <Check size={18} className="shrink-0 text-core-muted" role="img" aria-label="Varianten vorhanden" />
                            : <Minus size={18} className="shrink-0 text-core-muted" role="img" aria-label="Keine Varianten" />}
                          <span className="grid size-[1.125rem] place-items-center">
                            {marked ? <Star size={18} fill="currentColor" className="text-core-warning" role="img" aria-label="Markiert" /> : null}
                          </span>
                        </span>
                      </td>
                    </tr>
                    );
                  })}{group.pageCount > 1 ? (
                    <tr className="border-b border-core-border bg-core-surface" data-testid={`card-page-${group.id}`}>
                      <td colSpan={3} className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <CoreTooltip label="Vorherige Seite anzeigen">
                            <button type="button" aria-label="Vorherige Seite anzeigen" className="inline-flex size-control shrink-0 items-center justify-center rounded-control border border-core-border bg-core-surface text-core-action transition hover:bg-core-hover disabled:cursor-not-allowed disabled:opacity-40" disabled={group.page === 0} onClick={() => setCardPageByDeckId((pages) => ({ ...pages, [group.id]: Math.max(0, group.page - 1) }))}>
                              <ChevronLeft size={16} aria-hidden="true" />
                            </button>
                          </CoreTooltip>
                          <span className="core-body text-core-muted">Seite {group.page + 1} von {group.pageCount}</span>
                          <CoreTooltip label="Nächste Seite anzeigen">
                            <button type="button" aria-label="Nächste Seite anzeigen" className="inline-flex size-control shrink-0 items-center justify-center rounded-control border border-core-border bg-core-surface text-core-action transition hover:bg-core-hover disabled:cursor-not-allowed disabled:opacity-40" disabled={group.page + 1 >= group.pageCount} onClick={() => setCardPageByDeckId((pages) => ({ ...pages, [group.id]: Math.min(group.pageCount - 1, group.page + 1) }))}>
                              <ChevronRight size={16} aria-hidden="true" />
                            </button>
                          </CoreTooltip>
                        </div>
                      </td>
                    </tr>
                  ) : null}</> : expanded ? (
                    <tr className="border-b border-core-border bg-core-surface">
                      <td colSpan={3} className="px-4 py-1 core-body text-core-muted">Keine Karten</td>
                    </tr>
                  ) : null}
                </tbody>
              );})}
          </table>
            </div>
          ) : (
            <div className="rounded-panel border border-core-border p-6 sm:p-8" role="status">
              <h4 className="core-heading-3 text-core-text">Keine Karten gefunden</h4>
              <p className="mt-1 core-body-large text-core-muted">Passe die Suche an.</p>
            </div>
          )}
        </div>
      </SoftPanel>}

      {detailOpen ? (typeof document === "undefined" ? renderDetailLayer() : createPortal(renderDetailLayer(), document.body)) : null}

      <ActionDialog
        open={Boolean(pendingDetailAction)}
        title="Änderungen übernehmen?"
        description="Du hast ungespeicherte Änderungen an dieser Karte. Speichere oder verwirf sie, bevor du den Editor verlässt."
        confirmLabel="Speichern"
        cancelLabel="Weiter bearbeiten"
        discardLabel="Verwerfen"
        confirmLoading={savingPendingDraft}
        restoreFocus={(reason) => {
          if (reason === "cancel") cardDraftGuardRef.current?.focus();
        }}
        onCancel={() => setPendingDetailAction(null)}
        onDiscard={discardPendingDetailDraft}
        onConfirm={() => void savePendingDetailDraft()}
      />
      <ActionDialog
        open={Boolean(pendingCardDelete)}
        title={pendingCardDelete && pendingCardDelete.graph.cards.length > 1 ? `Inhalt mit ${pendingCardDelete.graph.cards.length} Karten löschen?` : "Karte löschen?"}
        description={pendingCardDelete && pendingCardDelete.graph.cards.length > 1 ? "Alle Karten dieses Inhalts werden gelöscht, auch in anderen Stapeln." : null}
        confirmLabel="Ja"
        cancelLabel="Nein"
        actionIcons={{ cancel: X, confirm: Check }}
        confirmLoading={deletingCard}
        onCancel={() => {
          if (!deletingCard) setPendingCardDelete(null);
        }}
        onConfirm={() => void confirmCardDelete()}
      />
    </div>
  );
}
