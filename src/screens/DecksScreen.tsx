import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Copy, FolderPlus, Layers, MoreHorizontal, MoveRight, Pencil, Play, PlusSquare, RotateCcw, Save, Search, Settings, Sparkles, Trash2, X } from "lucide-react";
import type { CardDraftGuard, DecksScreenProps } from "../appScreenProps.ts";
import { getCardEditorValue, getOriginalVariant, getVariantAnchor, validateCardEditorValue } from "../coreModel.ts";
import { createVariantReviewModel } from "../coreVariantService.ts";
import { createDeckPlacementValidator, MAX_INTERACTIVE_DECK_LEVELS } from "../coreWorkspace.ts";
import { stripHtml } from "../htmlSafety.ts";
import { createCardTableModel, DEFAULT_CARD_TABLE_SORT, type CardTableGroup, type CardTableSort, type CardTableSortField } from "../libraryModel.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CardHtml, useDeckMediaUrls } from "../ui/cardMedia.tsx";
import { ActionDialog, CoreModeControl, DonutValue, EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { DeckAppearanceIcon } from "../ui/deckAppearance.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { cardTypeOptions, formatLevelList, getStateValue, maturityStageLabels } from "./screenConstants.ts";
import type { CardEditorField, CardEditorFieldErrors, CardEditorValue, CardType, CardVariant, CoreMode, Deck, LearningItem } from "../coreTypes.ts";

const variantLevelOptions = [1, 2, 3].map((level) => ({ value: String(level), label: `Level ${level}` }));
const coreModeFilterOptions = [
  { value: "all", label: "Alle Modi" },
  { value: "off", label: "Aus" },
  { value: "auto", label: "Auto" },
  { value: "manual", label: "Manuell" },
];

const deckCountDefinitions = [
  { label: "Neu", valueKey: "newCards", color: "var(--core-deck-new-text)" },
  { label: "Fällig", valueKey: "dueCards", color: "var(--core-deck-due-text)" },
  { label: "Gesamt", valueKey: "totalCards", color: "var(--core-deck-total-text)" },
] as const;

interface PendingDetailAction {
  run: () => void;
}

function SortHeader({ field, label, width, sort, onChange }: {
  field: CardTableSortField;
  label: string;
  width: string;
  sort: CardTableSort;
  onChange: (field: CardTableSortField) => void;
}) {
  const active = sort.field === field;
  const directionLabel = active && sort.direction === "desc" ? "absteigend" : "aufsteigend";
  const SortIcon = active && sort.direction === "desc" ? ArrowDown : ArrowUp;

  return (
    <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`${width} px-4 py-3 text-left`}>
      <button
        type="button"
        onClick={() => onChange(field)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)] hover:text-[var(--core-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)]"
        aria-label={`${label} ${directionLabel} sortieren`}
      >
        {label}
        <SortIcon size={15} aria-hidden="true" className={active ? "opacity-100" : "opacity-35"} />
      </button>
    </th>
  );
}

function FieldError({ errors, field }: { errors: CardEditorFieldErrors; field: CardEditorField }) {
  const message = errors[field];
  return message ? <p className="core-body font-medium text-core-text" role="alert">{message}</p> : null;
}

function versionContent(value: unknown, fallback: LearningItem) {
  const snapshot = value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    front: typeof snapshot.originalFront === "string" ? snapshot.originalFront : fallback.originalFront,
    back: typeof snapshot.originalBack === "string" ? snapshot.originalBack : fallback.originalBack,
    tags: Array.isArray(snapshot.originalTags) ? snapshot.originalTags.map(String) : fallback.originalTags,
    kind: typeof snapshot.kind === "string" ? snapshot.kind : fallback.kind,
  };
}

function DeckCardEditor({ deck, card, mediaUrls = {}, onSaveCard, onDuplicateCard, onDeleteCard, onRestoreCard, onAddVariant, onGenerateVariant, onClose, onDraftStateChange }: any) {
  const [form, setForm] = React.useState<CardEditorValue | null>(() => card ? getCardEditorValue(card) : null);
  const [savedForm, setSavedForm] = React.useState(() => JSON.stringify(form));
  const [fieldErrors, setFieldErrors] = React.useState<CardEditorFieldErrors>({});
  const [saveStatus, setSaveStatus] = React.useState("");
  const [saveError, setSaveError] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDuplicating, setIsDuplicating] = React.useState(false);
  const [duplicateStatus, setDuplicateStatus] = React.useState("");
  const [variantForm, setVariantForm] = React.useState({ front: "", back: "", variantLevel: 2 });
  const [variantStatus, setVariantStatus] = React.useState("");
  const [variantStatusWarning, setVariantStatusWarning] = React.useState(false);
  const [isGeneratingVariant, setIsGeneratingVariant] = React.useState(false);
  const [restoreVersionId, setRestoreVersionId] = React.useState("");
  const [confirmRestore, setConfirmRestore] = React.useState(false);
  const [restoreStatus, setRestoreStatus] = React.useState("");
  const restoreSelectRef = React.useRef<HTMLButtonElement | null>(null);
  const restoreConfirmRef = React.useRef<HTMLButtonElement | null>(null);
  const restoreActionRef = React.useRef<HTMLButtonElement | null>(null);
  const editorHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const saveDraftRef = React.useRef<() => Promise<boolean>>(async () => false);
  const draftDirty = Boolean(form && JSON.stringify(form) !== savedForm);
  const focusDraft = React.useCallback(() => editorHeadingRef.current?.focus(), []);
  const variantReviewModel = React.useMemo(
    () => card ? createVariantReviewModel(card, deck?.reviewEvents ?? []) : null,
    [card, deck?.reviewEvents],
  );
  const restorableVersions = React.useMemo(
    () => [...(card?.versionLog ?? [])].reverse().filter((entry: any) => entry.before && typeof entry.before === "object"),
    [card?.updatedAt, card?.versionLog],
  );
  const versionOptions = React.useMemo(() => [
    { value: "", label: "Version auswählen" },
    ...restorableVersions.map((entry: any) => ({
      value: entry.id,
      label: `Stand vor ${new Date(entry.createdAt).toLocaleString("de-DE")} · ${entry.reason || entry.changeType}`,
    })),
  ], [restorableVersions]);

  React.useEffect(() => {
    const nextForm = card ? getCardEditorValue(card) : null;
    setForm(nextForm);
    setSavedForm(JSON.stringify(nextForm));
    setFieldErrors({});
    setSaveError(false);
    setVariantForm({ front: "", back: "", variantLevel: 2 });
    setVariantStatus("");
    setVariantStatusWarning(false);
  }, [card?.id, card?.updatedAt]);

  React.useEffect(() => {
    setSaveStatus("");
    setSaveError(false);
    setDuplicateStatus("");
    setRestoreVersionId("");
    setConfirmRestore(false);
    setRestoreStatus("");
  }, [card?.id]);

  React.useEffect(() => {
    if (confirmRestore) restoreActionRef.current?.focus();
  }, [confirmRestore]);

  React.useEffect(() => {
    onDraftStateChange?.(draftDirty ? { focus: focusDraft, save: () => saveDraftRef.current() } : null);
  }, [draftDirty, focusDraft, onDraftStateChange]);

  React.useEffect(() => () => onDraftStateChange?.(null), [onDraftStateChange]);

  if (!card) return null;

  const { maturity, readiness, coverage } = variantReviewModel!;
  const originalVariant = getOriginalVariant(card);
  const variants = card.variants ?? [];
  const selectedVersion = restorableVersions.find((entry: any) => entry.id === restoreVersionId) ?? null;
  const currentContent = versionContent({
    originalFront: card.originalFront,
    originalBack: card.originalBack,
    originalTags: card.originalTags,
    kind: card.kind,
  }, card);
  const restoredContent = selectedVersion ? versionContent(selectedVersion.before, card) : null;

  function update(key: string, value: string | string[] | number) {
    setForm((current) => current ? ({ ...current, [key]: value } as CardEditorValue) : current);
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setSaveStatus("");
    setSaveError(false);
  }

  function updateMcOption(index: number, option: string) {
    if (form?.cardType !== "multiple-choice") return;
    update("options", form.options.map((current, optionIndex) => optionIndex === index ? option : current));
  }

  function addMcOption() {
    if (form?.cardType !== "multiple-choice") return;
    update("options", [...form.options, ""]);
  }

  function removeMcOption(index: number) {
    if (form?.cardType !== "multiple-choice" || form.options.length <= 2) return;
    const options = form.options.filter((_, optionIndex) => optionIndex !== index);
    const correctOptionIndex = form.correctOptionIndex === index ? 0 : form.correctOptionIndex > index ? form.correctOptionIndex - 1 : form.correctOptionIndex;
    setForm({ ...form, options, correctOptionIndex });
    setFieldErrors((current) => ({ ...current, options: undefined, correctOptionIndex: undefined }));
  }

  async function saveEditorValue(): Promise<boolean> {
    if (!form) return false;
    const validation = validateCardEditorValue(form);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      setSaveError(true);
      setSaveStatus("Bitte die markierten Felder prüfen.");
      return false;
    }
    setIsSaving(true);
    setSaveError(false);
    setSaveStatus("Karte wird gespeichert …");
    try {
      await onSaveCard(card.id, validation.value);
      setForm(validation.value);
      setSavedForm(JSON.stringify(validation.value));
      setFieldErrors({});
      setSaveStatus("Karte gespeichert. Reviewdarstellung, Varianten und Cloudstand wurden aktualisiert.");
      return true;
    } catch {
      setSaveError(true);
      setSaveStatus("Karte ist lokal gespeichert, aber die Cloud-Synchronisierung ist fehlgeschlagen. Bitte später erneut versuchen.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function duplicateCard() {
    if (!form) return;
    setIsDuplicating(true);
    setDuplicateStatus("Kopie wird erstellt …");
    try {
      const result = await onDuplicateCard(card.id);
      setDuplicateStatus(result ? "Kopie direkt unter der Ausgangskarte erstellt." : "Die Karte konnte nicht kopiert werden.");
    } catch {
      setDuplicateStatus("Die Kopie ist lokal erstellt; die Cloud-Synchronisierung steht noch aus.");
    } finally {
      setIsDuplicating(false);
    }
  }

  function updateVariantForm(key: string, value: string|number) {
    setVariantForm((current) => ({ ...current, [key]: value }));
  }

  function addManualVariant() {
    if (!variantForm.front.trim() || !variantForm.back.trim()) {
      setVariantStatus("Bitte Frage und Antwort für die Umformulierung ausfüllen.");
      return;
    }
    onAddVariant(card.id, {
      ...variantForm,
      variantLevel: Number(variantForm.variantLevel) || 2,
      generationSource: "user_edited",
    });
    setVariantForm({ front: "", back: "", variantLevel: 2 });
    setVariantStatus("Umformulierung gespeichert.");
    setVariantStatusWarning(false);
  }

  async function generateVariant() {
    if (card.cardType !== "basic" || isGeneratingVariant) return;
    setIsGeneratingVariant(true);
    setVariantStatusWarning(false);
    setVariantStatus("KI-Variante wird erzeugt …");
    try {
      const result = await onGenerateVariant(card.id);
      const usedFallback = result.privacyMode === "non_zdr";
      setVariantStatusWarning(usedFallback);
      setVariantStatus(usedFallback
        ? "KI-Variante erstellt. Da kein passendes ZDR-Modell verfügbar war, wurde ein kostenloses Modell ohne Zero Data Retention verwendet."
        : "KI-Variante erstellt und am Original verankert.");
    } catch (error) {
      setVariantStatusWarning(true);
      setVariantStatus(error instanceof Error ? error.message : "Die KI-Variante konnte nicht erstellt werden.");
    } finally {
      setIsGeneratingVariant(false);
    }
  }

  function restoreSelectedVersion() {
    if (!selectedVersion) return;
    const result = onRestoreCard(card.id, selectedVersion.id);
    if (!result) {
      setRestoreStatus("Die Version konnte nicht wiederhergestellt werden.");
      return;
    }
    setConfirmRestore(false);
    setRestoreVersionId("");
    setRestoreStatus("Version wiederhergestellt. Der Restore wurde als neuer Versionseintrag gespeichert.");
    window.requestAnimationFrame(() => restoreSelectRef.current?.focus());
  }

  saveDraftRef.current = saveEditorValue;

  return (
    <SoftPanel className="min-h-full rounded-none border-0 p-5 shadow-none sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 ref={editorHeadingRef} tabIndex={-1} className="break-words core-heading-3 font-semibold text-[var(--core-text)] outline-none">Karte bearbeiten</h2>
          <p className="mt-1 core-caption text-[var(--core-text-muted)]">{cardTypeOptions.find((option) => option.value === card.cardType)?.label ?? card.cardType}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <IconButton label="Detailansicht schließen" icon={X} onClick={onClose} />
          {form ? (
            <button type="button" onClick={() => void saveEditorValue()} disabled={isSaving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--core-action-primary)] px-4 core-body font-semibold text-[var(--core-text-on-accent)] disabled:opacity-60">
              <Save size={16} aria-hidden="true" />
              {isSaving ? "Speichert …" : "Speichern"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void duplicateCard()}
            disabled={!form || isDuplicating}
            title={form ? "Eigenständige Kopie direkt unter dieser Karte erstellen" : "Dieser importierte Kartentyp kann nicht kopiert werden."}
            aria-describedby={!form ? "copy-disabled-" + card.id : undefined}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-4 core-body font-semibold text-[var(--core-action-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy size={16} aria-hidden="true" />
            {isDuplicating ? "Kopiert …" : "Kopieren"}
          </button>
          <button
            type="button"
            onClick={() => onDeleteCard(card.id)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-core-danger bg-core-danger-soft px-4 core-body font-semibold text-core-text"
          >
            <Trash2 size={16} aria-hidden="true" />
            Löschen
          </button>
        </div>
      </div>
      {form ? (
        <div className="grid min-w-0 gap-4">
          {form.cardType === "basic" || form.cardType === "basic-reversed" ? (
            <div className="grid min-w-0 gap-4">
              <div className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                <span>Vorderseite</span>
                <RichTextEditor value={form.front} onChange={(value) => update("front", value)} ariaLabel="Karten-Vorderseite" ariaInvalid={Boolean(fieldErrors.front)} minHeightClass="min-h-32" />
                <FieldError errors={fieldErrors} field="front" />
              </div>
              <div className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                <span>Rückseite</span>
                <RichTextEditor value={form.back} onChange={(value) => update("back", value)} ariaLabel="Karten-Rückseite" ariaInvalid={Boolean(fieldErrors.back)} minHeightClass="min-h-32" />
                <FieldError errors={fieldErrors} field="back" />
              </div>
            </div>
          ) : null}
          {form.cardType === "cloze" ? (
            <div className="grid min-w-0 gap-4">
              <div className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                <span>Cloze-Text</span>
                <RichTextEditor value={form.textWithClozes} onChange={(value) => update("textWithClozes", value)} ariaLabel="Cloze-Text" ariaInvalid={Boolean(fieldErrors.textWithClozes)} minHeightClass="min-h-32" />
                <p className="core-body font-normal text-[var(--core-text-muted)]">Lücken mit <code>{"{{c1::Begriff}}"}</code> markieren. Gleiche Nummern gehören zu einer Reviewrichtung.</p>
                <FieldError errors={fieldErrors} field="textWithClozes" />
              </div>
              <div className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                <span>Zusatzinfo</span>
                <RichTextEditor value={form.extra} onChange={(value) => update("extra", value)} ariaLabel="Cloze-Zusatzinfo" minHeightClass="min-h-32" />
              </div>
            </div>
          ) : null}
          {form.cardType === "multiple-choice" ? (
            <div className="grid min-w-0 gap-4">
              <div className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                <span>Frage</span>
                <RichTextEditor value={form.question} onChange={(value) => update("question", value)} ariaLabel="Multiple-Choice-Frage" ariaInvalid={Boolean(fieldErrors.question)} minHeightClass="min-h-32" />
                <FieldError errors={fieldErrors} field="question" />
              </div>
              <fieldset className="grid gap-3 rounded-xl border border-[var(--core-border)] p-4">
                <legend className="px-1 core-body font-semibold text-[var(--core-text-secondary)]">Antwortoptionen und richtige Antwort</legend>
                {form.options.map((option, index) => (
                  <div key={index} className="flex min-w-0 items-center gap-2">
                    <input type="radio" name={`correct-option-${card.id}`} checked={form.correctOptionIndex === index} onChange={() => update("correctOptionIndex", index)} aria-label={`Option ${index + 1} als richtig markieren`} aria-invalid={Boolean(fieldErrors.correctOptionIndex)} />
                    <input className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--core-border)] px-3" value={option} onChange={(event) => updateMcOption(index, event.target.value)} aria-label={`Antwortoption ${index + 1}`} aria-invalid={Boolean(fieldErrors.options)} />
                    <button type="button" onClick={() => removeMcOption(index)} disabled={form.options.length <= 2} className="grid size-11 place-items-center rounded-xl border border-[var(--core-border)] text-[var(--core-text-muted)] disabled:opacity-40" aria-label={`Antwortoption ${index + 1} entfernen`}><X size={16} aria-hidden="true" /></button>
                  </div>
                ))}
                <button type="button" onClick={addMcOption} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[var(--core-border)] px-3 core-body font-semibold text-[var(--core-action-primary)]"><PlusSquare size={16} aria-hidden="true" />Option hinzufügen</button>
                <FieldError errors={fieldErrors} field="options" />
                <FieldError errors={fieldErrors} field="correctOptionIndex" />
              </fieldset>
              <div className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                <span>Erklärung (optional)</span>
                <RichTextEditor value={form.explanation} onChange={(value) => update("explanation", value)} ariaLabel="Erklärung zur richtigen Antwort" minHeightClass="min-h-28" />
              </div>
            </div>
          ) : null}
          <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
            Tags
            <input className="min-h-11 min-w-0 rounded-xl border border-[var(--core-border)] px-3" value={form.tags.join(" ")} onChange={(event) => update("tags", event.target.value.split(/\s+/).filter(Boolean))} />
          </label>
          {saveStatus ? <p className={saveError ? "core-status-error" : "core-status-success"} role={saveError ? "alert" : "status"}>{saveStatus}</p> : null}
          {duplicateStatus ? <p className="core-status-success" role="status">{duplicateStatus}</p> : null}
        </div>
      ) : (
        <div id={"copy-disabled-" + card.id} className="rounded-xl border border-core-warning bg-core-warning-soft p-4 core-body font-medium text-core-text" role="status">
          Dieser importierte Kartentyp wird hier nur angezeigt und kann nicht kopiert werden. Typgerechtes Bearbeiten und Kopieren ist für Basic, Reverse, Cloze und Multiple Choice verfügbar.
        </div>
      )}
      <details className="mt-5 min-w-0 rounded-xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-4">
        <summary className="cursor-pointer core-body font-semibold text-[var(--core-action-primary)]">Details, Herkunft und Versionen</summary>
      <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))]">
        <div className="min-w-0 rounded-xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-4">
          <p className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Initialer Anker</p>
          <CardHtml html={card.immutableOriginal?.front} mediaUrls={mediaUrls} />
        </div>
        <div className="min-w-0 rounded-xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-4">
          <p className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Quellenanker</p>
          <p className="mt-2 break-words core-body text-[var(--core-text)]">{card.sourceAnchors?.[0]?.documentName || "Kein Dokumentanker"}</p>
          <p className="mt-1 break-words core-body text-[var(--core-text-muted)]">{card.sourceAnchors?.[0]?.textQuote || "Import- oder manuelle Originalkarte"}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-4">
          <p className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Versionen</p>
          <p className="mt-2 core-heading-2 font-semibold text-[var(--core-text)]">{card.versionLog?.length ?? 0}</p>
          <p className="mt-1 core-body text-[var(--core-text-muted)]">Änderungslogeinträge</p>
        </div>
      </div>
      {card.originalFields.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--core-border)] bg-core-surface p-4">
          <p className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Importierte Rohfelder (read-only)</p>
          <dl className="mt-3 grid gap-3">
            {card.originalFields.map((field: { name: string; value: string }, index: number) => (
              <div key={`${field.name}-${index}`} className="grid gap-1">
                <dt className="core-body font-semibold text-[var(--core-text-secondary)]">{field.name}</dt>
                <dd className="break-words core-body text-[var(--core-text-muted)]"><CardHtml html={field.value} mediaUrls={mediaUrls} /></dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <section className="mt-5 min-w-0 rounded-xl border border-[var(--core-border)] bg-core-surface p-4" aria-labelledby={`version-restore-${card.id}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="grid min-w-0 flex-1 gap-2 core-body font-semibold text-[var(--core-text-secondary)]" htmlFor={`version-select-${card.id}`}>
            <span id={`version-restore-${card.id}`}>Frühere Version wiederherstellen</span>
            <CoreSelect
              ref={restoreSelectRef}
              id={`version-select-${card.id}`}
              ariaLabel="Version zum Wiederherstellen"
              className="w-full"
              value={restoreVersionId}
              options={versionOptions}
              onValueChange={(versionId) => {
                setRestoreVersionId(versionId);
                setConfirmRestore(false);
                setRestoreStatus("");
              }}
            />
          </label>
          {selectedVersion && !confirmRestore ? (
            <button ref={restoreConfirmRef} type="button" onClick={() => setConfirmRestore(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--core-surface-muted)] px-4 core-body font-semibold text-[var(--core-action-primary)]">
              <RotateCcw size={16} aria-hidden="true" />
              Restore bestätigen
            </button>
          ) : null}
        </div>
        {restoredContent ? (
          <div className="mt-4 grid min-w-0 gap-3" data-testid="version-restore-summary">
            <p className="core-body text-[var(--core-text-muted)]">Vergleiche den aktuellen Inhalt mit dem Stand, der als neue Version übernommen wird.</p>
            {[
              ["Vorderseite", currentContent.front, restoredContent.front],
              ["Rückseite", currentContent.back, restoredContent.back],
              ["Tags", currentContent.tags.join(" "), restoredContent.tags.join(" ")],
              ["Kartentyp", currentContent.kind, restoredContent.kind],
            ].map(([label, current, restored]) => (
              <div key={label} className="grid min-w-0 gap-2 rounded-xl border border-[var(--core-border)] p-3 md:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
                <span className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">{label}</span>
                <span className="break-words core-body text-[var(--core-text)]"><span className="font-semibold">Aktuell:</span> {current || "—"}</span>
                <span className="break-words core-body text-[var(--core-text)]"><span className="font-semibold">Nach Restore:</span> {restored || "—"}</span>
              </div>
            ))}
          </div>
        ) : null}
        {confirmRestore && selectedVersion ? (
          <div className="mt-4 rounded-xl border border-core-warning bg-core-warning-soft p-4" role="group" aria-label="Restore endgültig bestätigen">
            <p className="core-body font-semibold text-core-text">Der gezeigte Stand ersetzt den aktuellen Karteninhalt. Der aktuelle Stand bleibt im Versionsverlauf erhalten.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button ref={restoreActionRef} type="button" onClick={restoreSelectedVersion} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--core-action-primary)] px-4 core-body font-semibold text-[var(--core-text-on-accent)]">
                <RotateCcw size={16} aria-hidden="true" />
                Wiederherstellen
              </button>
              <button type="button" onClick={() => {
                setConfirmRestore(false);
                window.requestAnimationFrame(() => restoreConfirmRef.current?.focus());
              }} className="min-h-11 rounded-xl border border-[var(--core-border)] bg-core-surface px-4 core-body font-semibold text-[var(--core-action-primary)]">
                Abbrechen
              </button>
            </div>
          </div>
        ) : null}
        {restoreStatus ? <p className="core-status-success mt-3 core-body font-semibold" role="status">{restoreStatus}</p> : null}
      </section>
      </details>
      <details className="mt-5 min-w-0 rounded-xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-4" data-testid="card-variant-tools">
        <summary className="cursor-pointer core-body font-semibold text-[var(--core-action-primary)]">Varianten und Lernwerte</summary>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        <div className="min-w-0 rounded-xl border border-[var(--core-border)] bg-core-surface p-4">
          <p className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Reifegrad</p>
          <p className="mt-2 break-words core-body-large font-semibold text-[var(--core-text)]">{(maturityStageLabels as Record<string, string>)[maturity.stage] ?? maturity.label}</p>
          <p className="mt-1 core-body text-[var(--core-text-muted)]">Score {maturity.score} · {maturity.description}</p>
          <p className="mt-2 core-caption text-[var(--core-text-muted)]">Stability {getStateValue(card.reviewState, "stability")} · Difficulty {getStateValue(card.reviewState, "difficulty")} · Reps {getStateValue(card.reviewState, "reps", getStateValue(card.reviewState, "repetitions"))}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-[var(--core-border)] bg-core-surface p-4">
          <p className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Variantenbereitschaft</p>
          <p className="mt-2 break-words core-body-large font-semibold text-[var(--core-text)]">{formatLevelList(readiness.allowedLevels)}</p>
          <p className="mt-1 break-words core-body text-[var(--core-text-muted)]">Bevorzugt Level {readiness.preferredLevel}. {readiness.reason}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-[var(--core-border)] bg-core-surface p-4">
          <p className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Variantenabdeckung</p>
          <p className="mt-2 break-words core-body-large font-semibold text-[var(--core-text)]">{coverage.activeRephraseCount} nahe Varianten</p>
          <p className="mt-1 break-words core-body text-[var(--core-text-muted)]">{coverage.hasEnoughVariants ? "Genug Varianten vorhanden." : "Weitere nahe Umformulierungen möglich."}</p>
        </div>
        </div>
        <div className="mt-5 min-w-0 rounded-xl border border-[var(--core-border)] bg-core-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Varianten dieser Grundkarte</p>
            <p className="mt-1 break-words core-body text-[var(--core-text-muted)]">Varianten sind Umformulierungen derselben Wissenseinheit; der Hauptfortschritt bleibt auf der Grundkarte.</p>
          </div>
          <span className="rounded-xl bg-[var(--core-surface-muted)] px-3 py-1 core-caption font-semibold text-[var(--core-action-primary)]">{variants.length} Formen</span>
        </div>
        <div className="mt-4 grid gap-3">
          {variants.filter((variant: any): variant is CardVariant => variant != null).map((variant: CardVariant) => {
            const anchor = getVariantAnchor(card, variant);
            return (
              <article key={variant.id} className={`min-w-0 rounded-xl border p-3 ${variant.isOriginal ? "border-[var(--core-border-interactive)] bg-[var(--core-info-surface)]" : variant.isActive === false || variant.qualityStatus !== "active" ? "border-core-border bg-core-subtle" : "border-[var(--core-border)] bg-[var(--core-surface-muted)]"}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2 core-caption font-semibold text-[var(--core-text-muted)]">
                  <span className="rounded-lg bg-core-surface px-2 py-1">{variant.isOriginal ? "Original" : "Variante"}</span>
                  <span>{variant.variantType}</span>
                  <span>Level {variant.variantLevel}</span>
                  <span>{variant.generationSource}</span>
                  <span>{variant.isActive === false || variant.qualityStatus !== "active" ? "inaktiv" : "aktiv"}</span>
                </div>
                <p className="break-words core-body font-semibold text-[var(--core-text)]">{variant.front}</p>
                <p className="mt-1 break-words core-body text-[var(--core-text-muted)]">{variant.back}</p>
                <p className="mt-2 core-caption text-[var(--core-text-muted)]">{variant.isOriginal ? "Originalanker dieser Grundkarte." : `Verankert an ${anchor?.id === originalVariant?.id ? "Originalkarte" : anchor?.id ?? "Originalkarte"}.`} Attempts {variant.performance?.attempts ?? 0} · Richtig {variant.performance?.correctCount ?? 0} · Falsch {variant.performance?.wrongCount ?? 0}</p>
              </article>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3 border-t border-[var(--core-border)] pt-4">
          <p className="core-body font-semibold text-[var(--core-text)]">Nahe Umformulierung hinzufügen</p>
          <p className="core-body text-[var(--core-text-muted)]">Prüfe dieselbe Wissenseinheit. Keine neuen Fakten, keine neuen Konzepte.</p>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-3">
            <ActionButton
              type="button"
              variant="secondary"
              icon={Sparkles}
              loading={isGeneratingVariant}
              disabled={card.cardType !== "basic" || isGeneratingVariant}
              onClick={() => void generateVariant()}
            >
              KI-Variante erzeugen
            </ActionButton>
            <p className="min-w-0 flex-1 core-caption text-[var(--core-text-muted)]">
              {card.cardType === "basic"
                ? "Sendet ausschließlich den bereinigten Text von Vorder- und Rückseite an OpenRouter. ZDR wird bevorzugt; ein kostenloser Non-ZDR-Fallback ist möglich."
                : "KI-Varianten sind derzeit nur für Basic-Karten verfügbar."}
            </p>
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input className="min-h-11 min-w-0 rounded-xl border border-[var(--core-border)] px-3 core-body" value={variantForm.front} onChange={(event) => updateVariantForm("front", event.target.value)} placeholder="Frage / Front" aria-label="Variantenfrage" />
            <input className="min-h-11 min-w-0 rounded-xl border border-[var(--core-border)] px-3 core-body" value={variantForm.back} onChange={(event) => updateVariantForm("back", event.target.value)} placeholder="Antwort / Back" aria-label="Variantenantwort" />
            <CoreSelect
              ariaLabel="Variantenlevel"
              className="w-full"
              value={String(variantForm.variantLevel)}
              options={variantLevelOptions}
              onValueChange={(variantLevel) => updateVariantForm("variantLevel", Number(variantLevel))}
            />
          </div>
          <button type="button" onClick={addManualVariant} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-[var(--core-action-primary)] px-3 core-body font-semibold text-[var(--core-text-on-accent)]">
            <PlusSquare size={16} aria-hidden="true" />
            Umformulierung hinzufügen
          </button>
          {variantStatus ? <p className={`core-body ${variantStatusWarning ? "text-core-warning" : "text-[var(--core-text-muted)]"}`} role="status" aria-live="polite">{variantStatus}</p> : null}
        </div>
        </div>
      </details>
    </SoftPanel>
  );
}

function DeckGroupMenu({
  group,
  onSetCoreMode,
  onOpenSettings,
  onRename,
  onMove,
  onCreateSubdeck,
  onLearn,
  onDelete,
}: {
  group: CardTableGroup;
  onSetCoreMode: (mode: CoreMode) => void;
  onOpenSettings: () => void;
  onRename: () => void;
  onMove: () => void;
  onCreateSubdeck: () => void;
  onLearn: (variants: boolean) => void;
  onDelete: () => void;
}) {
  const menuActionClass = "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left core-body font-semibold text-[var(--core-text-secondary)] hover:bg-[var(--core-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)]";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <IconButton
          label={"Optionen für " + group.path}
          icon={MoreHorizontal}
          data-testid={"deck-options-" + group.id}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-testid={"deck-options-menu-" + group.id}
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="core-overlay z-[60] grid w-72 gap-3 rounded-2xl border border-[var(--core-border)] bg-core-surface p-3 shadow-xl"
        >
          <p className="truncate px-2 core-body font-semibold text-[var(--core-text)]">{group.path}</p>
          <div className="grid gap-2 px-2">
            <span className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">CoRe-Modus</span>
            <CoreModeControl value={group.coreMode} onChange={onSetCoreMode} />
          </div>
          <div className="grid gap-1 border-t border-[var(--core-border)] pt-2">
            <Popover.Close asChild><button type="button" className={menuActionClass} onClick={onOpenSettings}><Settings size={16} aria-hidden="true" />Einstellungen</button></Popover.Close>
            <Popover.Close asChild><button type="button" className={menuActionClass} data-testid={"deck-rename-button-" + group.id} onClick={onRename}><Pencil size={16} aria-hidden="true" />Umbenennen</button></Popover.Close>
            <Popover.Close asChild><button type="button" className={menuActionClass} data-testid={"deck-move-button-" + group.id} onClick={onMove}><MoveRight size={16} aria-hidden="true" />Verschieben</button></Popover.Close>
            <Popover.Close asChild><button type="button" className={menuActionClass} onClick={onCreateSubdeck}><FolderPlus size={16} aria-hidden="true" />Unterstapel</button></Popover.Close>
            <Popover.Close asChild><button type="button" className={menuActionClass} onClick={() => onLearn(false)}><Play size={16} aria-hidden="true" />Lernen</button></Popover.Close>
            <Popover.Close asChild><button type="button" className={menuActionClass} onClick={() => onLearn(true)}><Sparkles size={16} aria-hidden="true" />Varianten lernen</button></Popover.Close>
            <Popover.Close asChild><button type="button" className={menuActionClass + " text-core-danger"} onClick={onDelete}><Trash2 size={16} aria-hidden="true" />Löschen</button></Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function DecksScreen({
  decks,
  mediaStore,
  selectedDeckId = null,
  selectedCardId = null,
  onSelectDeck,
  onSetDeckCoreMode,
  onSaveCard,
  onDuplicateCard,
  onDeleteCard,
  onUndoDeleteCard,
  onRestoreCard,
  onAddVariant,
  onGenerateVariant,
  onStartDeck,
  onDeleteDeck,
  onRenameDeck,
  onMoveDeck,
  onOpenCardCreation,
  onPrepareSubdeckCreation,
  onOpenLearn,
  onOpenDeckSettings,
  onDraftStateChange,
}: DecksScreenProps) {
  const [query, setQuery] = React.useState("");
  const [modeFilter, setModeFilter] = React.useState<CoreMode | "all">("all");
  const [cardSort, setCardSort] = React.useState<CardTableSort>(DEFAULT_CARD_TABLE_SORT);
  const [expandedDeckIds, setExpandedDeckIds] = React.useState<Set<string>>(() => new Set());
  const [deckStatus, setDeckStatus] = React.useState("");
  const [deckStatusType, setDeckStatusType] = React.useState<"status" | "alert">("status");
  const [editingDeckId, setEditingDeckId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState("");
  const [movingDeckId, setMovingDeckId] = React.useState<string | null>(null);
  const [moveTargetId, setMoveTargetId] = React.useState("");
  const [pendingCardDelete, setPendingCardDelete] = React.useState<{ deckId: string; card: LearningItem } | null>(null);
  const [deletedCardUndo, setDeletedCardUndo] = React.useState<{ deckId: string; card: LearningItem; description: string } | null>(null);
  const [pendingDeckDelete, setPendingDeckDelete] = React.useState<{ deck: Deck; row: CardTableGroup } | null>(null);
  const [pendingDetailAction, setPendingDetailAction] = React.useState<PendingDetailAction | null>(null);
  const [savingPendingDraft, setSavingPendingDraft] = React.useState(false);
  const cardDraftGuardRef = React.useRef<CardDraftGuard | null>(null);
  const detailRef = React.useRef<HTMLElement | null>(null);
  const previouslySelectedCardId = React.useRef<string | null>(null);
  const tableModel = React.useMemo(
    () => createCardTableModel(decks, { query, coreMode: modeFilter, cardSort }),
    [cardSort, decks, modeFilter, query],
  );
  const searchExpandsGroups = Boolean(query.trim());
  const groupById = React.useMemo(() => new Map(tableModel.allGroups.map((group) => [group.id, group])), [tableModel.allGroups]);
  const selectedGroup = selectedDeckId ? groupById.get(selectedDeckId) ?? null : null;
  const selectedDeck = selectedGroup?.deck ?? null;
  const selectedCard = selectedGroup?.activeCards.find((card) => card.id === selectedCardId) ?? null;
  const selectedDeckMissing = Boolean(selectedDeckId && !selectedDeck);
  const selectedCardMissing = Boolean(selectedDeck && selectedCardId && !selectedCard);
  const detailOpen = Boolean(selectedCard || selectedDeckMissing || selectedCardMissing);
  const validMoveTargetOptions = React.useMemo(() => {
    if (!movingDeckId) return [];
    const validatePlacement = createDeckPlacementValidator(decks, movingDeckId);
    return [
      { value: "", label: "Hauptebene" },
      ...tableModel.allGroups
        .filter((candidate) => validatePlacement(candidate.id) === null)
        .map((candidate) => ({ value: candidate.id, label: candidate.path })),
    ];
  }, [decks, movingDeckId, tableModel.allGroups]);
  const { urls: selectedDeckMediaUrls } = useDeckMediaUrls(selectedDeck, mediaStore);
  const handleEditorDraftStateChange = React.useCallback((guard: CardDraftGuard | null) => {
    cardDraftGuardRef.current = guard;
    onDraftStateChange(guard);
  }, [onDraftStateChange]);

  React.useEffect(() => {
    if (!selectedDeckId) return;
    setExpandedDeckIds((current) => current.has(selectedDeckId) ? current : new Set([...current, selectedDeckId]));
  }, [selectedDeckId]);

  React.useEffect(() => {
    setEditingDeckId(null);
    setRenameDraft("");
    setMovingDeckId(null);
    setMoveTargetId("");
  }, [selectedDeckId]);

  React.useEffect(() => {
    if (!detailOpen) return;
    previouslySelectedCardId.current = selectedCardId;
    window.requestAnimationFrame(() => detailRef.current?.focus());

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || pendingDetailAction || pendingCardDelete || pendingDeckDelete) return;
      event.preventDefault();
      requestDetailAction(closeDetail);
    }

    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || detailRef.current?.contains(target)) return;
      if (pendingCardDelete && target.closest('[data-testid="action-dialog-backdrop"]')) setPendingCardDelete(null);
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
  }, [detailOpen, pendingCardDelete, pendingDeckDelete, pendingDetailAction, selectedCardId, selectedDeckId]);

  function focusCardRow(cardId: string | null) {
    window.requestAnimationFrame(() => {
      const target = cardId ? document.querySelector<HTMLElement>('[data-testid="deck-card-' + cardId + '"]') : null;
      (target ?? document.querySelector<HTMLElement>("[data-screen-heading]"))?.focus();
    });
  }

  function closeDetail() {
    const cardId = previouslySelectedCardId.current ?? selectedCardId;
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
    setCardSort((current) => current.field === field
      ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
      : { field, direction: "asc" });
  }

  function toggleDeckCards(deckId: string) {
    setExpandedDeckIds((current) => {
      const next = new Set(current);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  }

  function saveCard(cardId: string, value: CardEditorValue) {
    if (!selectedDeck) return;
    return onSaveCard(selectedDeck.id, cardId, value);
  }

  function requestCardDelete(cardId: string) {
    if (!selectedDeck) return;
    const card = selectedDeck.cards.find((candidate) => candidate.id === cardId);
    if (card) setPendingCardDelete({ deckId: selectedDeck.id, card });
  }

  async function confirmCardDelete() {
    if (!pendingCardDelete) return;
    const description = stripHtml(pendingCardDelete.card.originalFront).replace(/\s+/g, " ").trim() || "Karte ohne Vorderseitentext";
    try {
      const result = await onDeleteCard(pendingCardDelete.deckId, pendingCardDelete.card.id);
      const deletedCard = result?.cards.find((card: LearningItem) => card.id === pendingCardDelete.card.id);
      if (deletedCard) setDeletedCardUndo({ deckId: pendingCardDelete.deckId, card: deletedCard, description });
      setPendingCardDelete(null);
      onSelectDeck(pendingCardDelete.deckId);
      focusCardRow(pendingCardDelete.card.id);
    } catch {
      setDeckStatus("Die Karte konnte nicht sicher gelöscht werden.");
      setDeckStatusType("alert");
    }
  }

  async function undoCardDelete() {
    if (!deletedCardUndo) return;
    try {
      const result = await onUndoDeleteCard(deletedCardUndo.deckId, deletedCardUndo.card);
      if (!result) throw new Error("Undo fehlgeschlagen.");
      onSelectDeck(deletedCardUndo.deckId, deletedCardUndo.card.id);
      setDeckStatus("Kartenlöschung rückgängig gemacht.");
      setDeckStatusType("status");
      setDeletedCardUndo(null);
    } catch {
      onSelectDeck(deletedCardUndo.deckId, deletedCardUndo.card.id);
      setDeckStatus("Kartenlöschung lokal rückgängig gemacht; die Cloud-Synchronisierung steht noch aus.");
      setDeckStatusType("alert");
      setDeletedCardUndo(null);
    }
  }

  function beginRename(deck: Deck) {
    setMovingDeckId(null);
    setMoveTargetId("");
    setEditingDeckId(deck.id);
    setRenameDraft(deck.name);
    setDeckStatus('"' + deck.name + '" umbenennen.');
    setDeckStatusType("status");
  }

  function cancelRename(deckId: string) {
    setEditingDeckId(null);
    setRenameDraft("");
    focusDeckAction(deckId, "rename");
  }

  function submitRename(event: React.SubmitEvent<HTMLFormElement>, deck: Deck) {
    event.preventDefault();
    const name = renameDraft.trim();
    if (!name) {
      setDeckStatus("Bitte gib einen Stapelnamen ein.");
      setDeckStatusType("alert");
      return;
    }
    const result = onRenameDeck(deck.id, name);
    if (result?.error) {
      setDeckStatus(result.error);
      setDeckStatusType("alert");
      return;
    }
    setEditingDeckId(null);
    setRenameDraft("");
    setDeckStatus('Stapel "' + (result?.deck?.name ?? deck.name) + '" umbenannt.');
    setDeckStatusType("status");
    focusDeckAction(deck.id, "options");
  }

  function beginMove(deck: Deck) {
    setEditingDeckId(null);
    setRenameDraft("");
    setMovingDeckId(deck.id);
    setMoveTargetId(deck.parentDeckId ?? "");
    setDeckStatus('Ziel für "' + deck.name + '" auswählen.');
    setDeckStatusType("status");
  }

  function cancelMove(deckId: string) {
    setMovingDeckId(null);
    setMoveTargetId("");
    focusDeckAction(deckId, "move");
  }

  function submitMove(event: React.SubmitEvent<HTMLFormElement>, deck: Deck) {
    event.preventDefault();
    const result = onMoveDeck(deck.id, moveTargetId || null);
    if (result?.error) {
      setDeckStatus(result.error);
      setDeckStatusType("alert");
      return;
    }
    setMovingDeckId(null);
    setMoveTargetId("");
    const target = groupById.get(moveTargetId)?.deck ?? null;
    setDeckStatus(result?.changedDeckIds?.length === 0
      ? 'Stapel "' + deck.name + '" bleibt an der bisherigen Stelle.'
      : target
        ? 'Stapel "' + deck.name + '" unter "' + target.name + '" verschoben.'
        : 'Stapel "' + deck.name + '" auf die Hauptebene verschoben.');
    setDeckStatusType("status");
    focusDeckAction(deck.id, "options");
  }

  function focusDeckAction(deckId: string, action: "rename" | "move" | "options") {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-testid="deck-' + action + '-button-' + deckId + '"], [data-testid="deck-options-' + deckId + '"]')?.focus();
    });
  }

  async function confirmDeckDelete() {
    if (!pendingDeckDelete) return;
    const result = await onDeleteDeck(pendingDeckDelete.deck.id);
    if (!result) return;
    if (pendingDeckDelete.row.scopeDeckIds.includes(selectedDeckId ?? "")) onSelectDeck(null);
    setDeckStatus(result.deletedDeckIds.length + " Stapel gelöscht.");
    setDeckStatusType("status");
    setPendingDeckDelete(null);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-screen-heading]")?.focus());
  }

  function renderDeckEditRows(group: CardTableGroup) {
    if (editingDeckId === group.id) {
      return (
        <tr className="bg-[var(--core-surface-muted)]">
          <td colSpan={3} className="p-4">
            <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => submitRename(event, group.deck)}>
              <label className="grid min-w-0 flex-1 gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                Stapelname
                <input autoFocus className="min-h-11 rounded-xl border border-[var(--core-border)] bg-core-surface px-3" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} />
              </label>
              <ActionButton type="submit" variant="primary" icon={Check}>Speichern</ActionButton>
              <ActionButton type="button" variant="tertiary" onClick={() => cancelRename(group.id)}>Abbrechen</ActionButton>
            </form>
          </td>
        </tr>
      );
    }
    if (movingDeckId === group.id) {
      return (
        <tr className="bg-[var(--core-surface-muted)]">
          <td colSpan={3} className="p-4">
            <form className="grid gap-3" onSubmit={(event) => submitMove(event, group.deck)}>
              <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                Neuer übergeordneter Stapel
                <CoreSelect
                  autoFocus
                  ariaLabel={`Ziel für ${group.deck.name}`}
                  className="w-full"
                  value={moveTargetId}
                  options={validMoveTargetOptions}
                  onValueChange={setMoveTargetId}
                />
              </label>
              <p className="core-caption text-[var(--core-text-muted)]">Maximal {MAX_INTERACTIVE_DECK_LEVELS} Ebenen. Ein Stapel kann nicht in sich selbst oder seine Unterstapel verschoben werden.</p>
              <div className="flex flex-wrap gap-2">
                <ActionButton type="submit" variant="primary" icon={MoveRight}>Verschieben bestätigen</ActionButton>
                <ActionButton type="button" variant="tertiary" onClick={() => cancelMove(group.id)}>Abbrechen</ActionButton>
              </div>
            </form>
          </td>
        </tr>
      );
    }
    return null;
  }

  function renderDetailAside() {
    return (
      <aside
        ref={detailRef}
        tabIndex={-1}
        aria-label="Kartendetail"
        data-testid="card-detail-aside"
        className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto border-l border-[var(--core-border)] bg-core-surface shadow-2xl focus:outline-none lg:w-1/2"
      >
        {selectedDeckMissing ? (
          <div className="grid min-h-full place-items-center p-6">
            <EmptyState
              icon={Layers}
              title="Stapel nicht gefunden"
              body="Der verlinkte Stapel ist nicht mehr verfügbar."
              action={<div className="flex flex-wrap justify-center gap-2"><ActionButton type="button" variant="primary" onClick={() => onOpenLearn(null)}>Zu Lernen</ActionButton><ActionButton type="button" variant="tertiary" onClick={() => onSelectDeck(null)}>Alle Karten</ActionButton></div>}
            />
          </div>
        ) : selectedCardMissing ? (
          <div className="grid min-h-full place-items-center p-6">
            <EmptyState
              icon={Layers}
              title="Karte nicht gefunden"
              body="Die verlinkte Karte ist in diesem Stapel nicht mehr verfügbar."
              action={<ActionButton type="button" variant="primary" onClick={closeDetail}>Zur Kartenliste</ActionButton>}
            />
          </div>
        ) : selectedDeck && selectedCard ? (
          <DeckCardEditor
            deck={selectedDeck}
            card={selectedCard}
            mediaUrls={selectedDeckMediaUrls}
            onSaveCard={saveCard}
            onDuplicateCard={(cardId: string) => onDuplicateCard(selectedDeck.id, cardId)}
            onDeleteCard={requestCardDelete}
            onRestoreCard={(cardId: string, versionId: string) => onRestoreCard(selectedDeck.id, cardId, versionId)}
            onAddVariant={(cardId: string, variant: any) => onAddVariant(selectedDeck.id, cardId, variant)}
            onGenerateVariant={(cardId: string) => onGenerateVariant(selectedDeck.id, cardId)}
            onClose={() => requestDetailAction(closeDetail)}
            onDraftStateChange={handleEditorDraftStateChange}
          />
        ) : null}
      </aside>
    );
  }

  return (
    <div className="relative grid min-w-0 gap-7">
      <PageHeader title="Kartenverwaltung" />

      <SoftPanel className="p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-3 core-body text-[var(--core-text-muted)]">
            <Search size={17} aria-hidden="true" />
            <input className="min-w-0 flex-1 bg-transparent outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Stapel, Vorderseite, Rückseite oder Tags suchen" aria-label="Karten durchsuchen" />
          </label>
          <CoreSelect
            ariaLabel="Karten nach CoRe-Modus filtern"
            className="shrink-0 font-semibold text-[var(--core-action-primary)]"
            value={modeFilter}
            options={coreModeFilterOptions}
            onValueChange={(coreMode) => setModeFilter(coreMode as CoreMode | "all")}
          />
          <ActionButton type="button" variant="primary" icon={PlusSquare} onClick={onOpenCardCreation}>Neue Karten</ActionButton>
          <span className="core-caption font-semibold text-[var(--core-text-muted)]" aria-live="polite">{tableModel.cardCount} {tableModel.cardCount === 1 ? "Karte" : "Karten"}</span>
        </div>
        {deckStatus ? <p className={"mt-3 core-body font-semibold " + (deckStatusType === "alert" ? "core-status-error" : "core-status-info")} role={deckStatusType}>{deckStatus}</p> : null}
        {deletedCardUndo ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-3">
            <p className="min-w-0 flex-1 truncate core-body text-[var(--core-text)]">„{deletedCardUndo.description}“ gelöscht.</p>
            <ActionButton type="button" variant="tertiary" icon={RotateCcw} onClick={() => void undoCardDelete()}>Rückgängig</ActionButton>
          </div>
        ) : null}
      </SoftPanel>

      {tableModel.groups.length ? (
        <SoftPanel className="min-w-0 overflow-hidden p-0">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[46rem] table-fixed border-collapse" data-testid="card-library-table">
              <thead className="sticky top-0 z-10 bg-core-surface">
                <tr className="border-b border-[var(--core-border)]">
                  <SortHeader field="sortField" label="Sortierfeld" width="w-[58%]" sort={cardSort} onChange={changeSort} />
                  <SortHeader field="due" label="Fällig" width="w-[18%]" sort={cardSort} onChange={changeSort} />
                  <SortHeader field="variants" label="Varianten" width="w-[24%]" sort={cardSort} onChange={changeSort} />
                </tr>
              </thead>
              {tableModel.groups.map((group) => {
                const expanded = searchExpandsGroups || expandedDeckIds.has(group.id);
                const directProgress = group.directSummary.totalCards
                  ? Math.round((group.directSummary.matureCards / group.directSummary.totalCards) * 100)
                  : 0;
                return (
                <tbody key={group.id} id={"deck-card-list-" + group.id} data-testid={"card-group-" + group.id}>
                  <tr className={"border-b border-[var(--core-border)] " + (selectedDeckId === group.id ? "bg-[var(--core-info-surface)]" : "bg-[var(--core-surface-muted)]")}>
                    <th scope="rowgroup" colSpan={3} className="px-3 py-2 text-left">
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 sm:grid-cols-[minmax(13rem,1fr)_minmax(15rem,auto)_auto] sm:gap-x-6">
                        <div className="flex min-w-0 items-center gap-2" style={{ paddingInlineStart: Math.min(group.depth, MAX_INTERACTIVE_DECK_LEVELS - 1) * 9 }}>
                          <button
                            type="button"
                            data-testid={"deck-toggle-" + group.id}
                            aria-expanded={expanded}
                            aria-controls={"deck-card-list-" + group.id}
                            aria-label={expanded ? `Karten von ${group.path} einklappen` : `Karten von ${group.path} aufklappen`}
                            onClick={() => toggleDeckCards(group.id)}
                            className="grid size-11 shrink-0 place-items-center rounded-lg text-[var(--core-action-primary)] transition hover:bg-[var(--core-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)]"
                          >
                            {expanded ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                          </button>
                          <DeckAppearanceIcon deck={group.deck} className="size-11 rounded-full bg-[var(--core-surface-muted)]" iconSize={20} />
                          <span className="min-w-0">
                            <span className="block truncate core-body-large font-semibold text-[var(--core-text)]">{group.deck.name}</span>
                            {group.depth > 0 ? <span className="mt-0.5 block truncate core-caption text-[var(--core-text-muted)]">{group.path}</span> : null}
                          </span>
                        </div>

                        <dl className="col-span-2 grid grid-cols-3 gap-3 sm:col-span-1 sm:min-w-[15rem]" aria-label={`Lernstand für ${group.path}`}>
                          {deckCountDefinitions.map((count) => (
                            <div key={count.valueKey} className="grid min-w-0 gap-0.5 text-left sm:text-right">
                              <dt className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">{count.label}</dt>
                              <dd className="core-body-large font-semibold" style={{ color: count.color }}>{group.directSummary[count.valueKey]}</dd>
                            </div>
                          ))}
                        </dl>

                        <div className="col-start-2 row-start-1 flex items-center justify-end gap-3 sm:col-start-auto sm:row-start-auto">
                          <DonutValue value={directProgress} />
                        <DeckGroupMenu
                          group={group}
                          onSetCoreMode={(mode) => onSetDeckCoreMode(group.id, mode)}
                          onOpenSettings={() => onOpenDeckSettings(group.id)}
                          onRename={() => beginRename(group.deck)}
                          onMove={() => beginMove(group.deck)}
                          onCreateSubdeck={() => onPrepareSubdeckCreation(group.id)}
                          onLearn={(variants) => onStartDeck(group.deck, variants)}
                          onDelete={() => setPendingDeckDelete({ deck: group.deck, row: group })}
                        />
                        </div>
                      </div>
                    </th>
                  </tr>
                  {renderDeckEditRows(group)}
                  {expanded && group.cardRows.length ? group.cardRows.map(({ card, frontPreview, dueLabel, variantsLabel, hasActiveVariants }) => (
                    <tr
                      key={card.id}
                      onClick={() => requestCardSelection(group.id, card.id)}
                      className={"cursor-pointer border-b border-[var(--core-border)] transition hover:bg-[var(--core-surface-muted)] " + (selectedCardId === card.id ? "bg-[var(--core-info-surface)]" : "bg-core-surface")}
                      data-selected={selectedCardId === card.id ? "true" : undefined}
                      data-card-row="true"
                    >
                      <td className="px-4 py-3 align-middle">
                        <button
                          type="button"
                          data-testid={"deck-card-" + card.id}
                          aria-pressed={selectedCardId === card.id}
                          className="line-clamp-2 min-h-11 w-full break-words text-left core-body font-semibold text-[var(--core-text)] focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)]"
                          onClick={(event) => {
                            event.stopPropagation();
                            requestCardSelection(group.id, card.id);
                          }}
                        >
                          {frontPreview}
                        </button>
                      </td>
                      <td className="px-4 py-3 align-middle"><span className="core-body text-[var(--core-text-secondary)]">{dueLabel}</span></td>
                      <td className="px-4 py-3 align-middle">
                        <span className={`inline-flex rounded-full border px-3 py-1 core-caption font-semibold ${hasActiveVariants ? "border-[var(--core-border-interactive)] bg-[var(--core-info-surface)] text-[var(--core-action-primary)]" : "border-[var(--core-border)] bg-[var(--core-surface-muted)] text-[var(--core-text-muted)]"}`}>
                          {variantsLabel}
                        </span>
                      </td>
                    </tr>
                  )) : expanded ? (
                    <tr className="border-b border-[var(--core-border)] bg-core-surface">
                      <td colSpan={3} className="px-4 py-4 core-body text-[var(--core-text-muted)]">Keine Karten</td>
                    </tr>
                  ) : null}
                </tbody>
              );})}
            </table>
          </div>
        </SoftPanel>
      ) : (
        <EmptyState icon={Layers} title="Keine Karten gefunden" body="Passe Suche oder CoRe-Modus an." />
      )}

      {detailOpen ? (typeof document === "undefined" ? renderDetailAside() : createPortal(renderDetailAside(), document.body)) : null}

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
        title="Karte löschen"
        description={null}
        confirmLabel="Ja"
        cancelLabel="Nein"
        actionIcons={{ cancel: X, confirm: Check }}
        destructive
        onCancel={() => setPendingCardDelete(null)}
        onConfirm={() => void confirmCardDelete()}
      />
      <ActionDialog
        open={Boolean(pendingDeckDelete)}
        title="Stapelbaum löschen?"
        description={pendingDeckDelete ? (
          <div className="grid gap-2">
            <p>„{pendingDeckDelete.deck.name}“ und alle Inhalte dieses Stapelbaums werden als gelöscht markiert.</p>
            <ul className="list-disc pl-5">
              <li>{Math.max(0, pendingDeckDelete.row.scopeDeckIds.length - 1)} Unterstapel</li>
              <li>{pendingDeckDelete.row.summary.totalCards} {pendingDeckDelete.row.summary.totalCards === 1 ? "aktive Karte" : "aktive Karten"}</li>
            </ul>
          </div>
        ) : null}
        confirmLabel="Stapelbaum löschen"
        cancelLabel="Abbrechen"
        destructive
        onCancel={() => setPendingDeckDelete(null)}
        onConfirm={() => void confirmDeckDelete()}
      />
    </div>
  );
}
