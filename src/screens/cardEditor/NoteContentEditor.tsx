import React from "react";
import { ArrowDown, ArrowUp, Keyboard, PlusSquare, X } from "lucide-react";
import { addNoteField, canRemoveNoteField, isMovableNoteField, moveNoteField, noteBlocks, removeNoteField, renameNoteField, setNoteFieldRole, setNoteReverse, setNoteTypeIn, validateNoteEditorValue, type AddableFieldRole, type NoteEditorErrors, type NoteEditorValue } from "../../coreModel.ts";
import type { Card, Note, NoteContent } from "../../coreTypes.ts";
import { IconButton } from "../../ui/actionUi.tsx";
import { CoreSegmentedControl } from "../../ui/coreUi.tsx";
import { NOTE_FIELD_ROLE_LABELS, NoteBlockControls } from "../../ui/NoteBlockControls.tsx";
import { NoteCardContent } from "../../ui/NoteCardContent.tsx";
import { RichTextEditor, type RichTextImageActions } from "../../ui/RichTextEditor.tsx";
import { CoreSelect } from "../../ui/selectUi.tsx";
import { noteKindLabel } from "./cardEditorModel.ts";

// Only own image occlusions need the mask editor; it stays out of the editor bundle until then.
const OcclusionEditor = React.lazy(() => import("../../ui/OcclusionEditor.tsx").then((module) => ({ default: module.OcclusionEditor })));

const PREVIEW_DELAY_MS = 150;
const FIELD_ROLE_NAMES: Record<Note["content"]["fields"][number]["role"], string> = { ...NOTE_FIELD_ROLE_LABELS, prompt: "Frage", answer: "Antwort", note: "Notiz" };
const SIDE_OPTIONS = [{ value: "question", label: "Vorderseite" }, { value: "answer", label: "Rückseite" }] as const;
const MOBILE_OPTIONS = [{ value: "edit", label: "Bearbeiten" }, { value: "preview", label: "Vorschau" }] as const;

/** A card the live preview can show: an existing sibling or one that saving would create. */
export interface PreviewCard {
  card: Card;
  label: string;
}

export interface NoteContentEditorProps {
  /** Base content for structure, media and preview; it need not be saved yet (W16). */
  note: Note;
  value: NoteEditorValue;
  structure: NoteContent;
  onValueChange: (update: (current: NoteEditorValue) => NoteEditorValue, changedKey: string) => void;
  onStructureChange: (next: NoteContent, addedFieldId?: string) => void;
  errors: NoteEditorErrors;
  changedFieldIds: ReadonlySet<string>;
  previewCards: readonly PreviewCard[];
  initialPreviewCardId: string;
  mediaUrls: Record<string, string>;
  imageActions?: RichTextImageActions;
  /** Own contents change their structure; imported ones keep Anki's field schema and prompts. */
  structureEditable: boolean;
  disabled?: boolean;
}

function FieldError({ errors, field }: { errors: NoteEditorErrors; field: string }) {
  const message = errors[field];
  return message ? <p className="core-body font-medium text-core-text" role="alert">{message}</p> : null;
}

/** The fields of a content with a live preview beside them; mobile switches between `Bearbeiten | Vorschau`. */
export function NoteContentEditor({ note, value, structure, onValueChange, onStructureChange, errors, changedFieldIds, previewCards, initialPreviewCardId, mediaUrls, imageActions, structureEditable, disabled = false }: NoteContentEditorProps) {
  const [mobileView, setMobileView] = React.useState<"edit" | "preview">("edit");
  const [previewCardId, setPreviewCardId] = React.useState(initialPreviewCardId);
  const [side, setSide] = React.useState<"question" | "answer">("question");
  const [round, setRound] = React.useState(0);
  const blocks = noteBlocks(structure);
  const movableFieldIds = structure.fields.filter(isMovableNoteField).map((field) => field.id);
  const interaction = structure.interaction;
  const choiceMode = interaction.kind === "choice" ? interaction.mode : null;
  const options = value.options ?? [];
  const correctCount = options.filter((option) => option.correct).length;
  const occlusionImage = structureEditable && interaction.kind === "image-occlusion" ? mediaUrls[interaction.image] : undefined;

  // The preview follows the draft about 150 ms after the last input; an invalid draft keeps the last valid one.
  const [preview, setPreview] = React.useState(() => ({ note, version: 0 }));
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const validation = validateNoteEditorValue({ ...note, content: structure }, value);
      if (!validation.ok) return;
      setPreview((current) => JSON.stringify(current.note.content) === JSON.stringify(validation.content)
        ? current
        : { note: { ...note, content: validation.content, contentRevision: note.contentRevision + current.version + 1 }, version: current.version + 1 });
    }, PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [note, structure, value]);
  React.useEffect(() => setPreviewCardId(initialPreviewCardId), [initialPreviewCardId]);
  const previewCard = previewCards.find((entry) => entry.card.id === previewCardId) ?? previewCards[0];

  function updateField(fieldId: string, html: string) {
    onValueChange((current) => ({ ...current, fields: { ...current.fields, [fieldId]: html } }), fieldId);
  }

  function updateOptions(next: NoteEditorValue["options"]) {
    onValueChange((current) => ({ ...current, options: next }), "options");
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

  function addField(role: AddableFieldRole) {
    const added = addNoteField(structure, role);
    onStructureChange(added.content, added.fieldId);
  }

  const fields = (
    <div className="grid min-w-0 content-start gap-4" inert={disabled}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2" data-testid="note-direction">
        <span className="core-body font-semibold text-core-text">{noteKindLabel({ content: structure })}</span>
        {structureEditable && blocks.reverse !== null ? (
          <CoreSegmentedControl
            ariaLabel="Lernrichtung"
            className="core-segmented-touch"
            options={[{ value: "standard", label: "Standard" }, { value: "both", label: "Beide Richtungen" }]}
            value={blocks.reverse ? "both" : "standard"}
            onValueChange={(next) => onStructureChange(setNoteReverse(structure, next === "both"))}
          />
        ) : null}
        {structureEditable && blocks.typeIn !== null ? (
          <button type="button" aria-pressed={blocks.typeIn} onClick={() => onStructureChange(setNoteTypeIn(structure, !blocks.typeIn))} className="core-action-secondary aria-pressed:border-core-action aria-pressed:bg-[var(--core-action-soft)] aria-pressed:text-core-action">
            <Keyboard size={16} aria-hidden="true" />
            Antwort eintippen
          </button>
        ) : null}
      </div>
      {structure.fields.map((field) => {
        const changed = changedFieldIds.has(field.id);
        const label = (
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="truncate">{field.name}</span>
            {changed ? <span className="size-2 shrink-0 rounded-round bg-core-action" role="img" aria-label="geändert" data-testid="field-changed" /> : null}
          </span>
        );
        return (
          <div key={field.id} className="grid min-w-0 gap-2 core-body font-semibold text-core-secondary">
            {structureEditable && canRemoveNoteField(structure, field.id) && field.id !== "front" && field.id !== "back" ? (
              <div className="flex min-w-0 flex-wrap items-end gap-2">
                <label className="grid min-w-0 flex-1 basis-48 gap-1">
                  <span className="core-caption font-semibold text-core-muted">{FIELD_ROLE_NAMES[field.role]} · Feldname</span>
                  <input className="min-h-control min-w-0 rounded-control border border-core-border bg-core-surface px-3" value={field.name} onChange={(event) => onStructureChange(renameNoteField(structure, field.id, event.target.value))} aria-label={`Name von ${field.name}`} />
                </label>
                {isMovableNoteField(field) ? (
                  <>
                    <label className="grid gap-1">
                      <span className="core-caption font-semibold text-core-muted">Rolle</span>
                      <CoreSelect
                        ariaLabel={`Rolle von ${field.name}`}
                        value={field.role}
                        options={blocks.fieldRoles.map((role) => ({ value: role, label: NOTE_FIELD_ROLE_LABELS[role] }))}
                        onValueChange={(role) => onStructureChange(setNoteFieldRole(structure, field.id, role as AddableFieldRole))}
                      />
                    </label>
                    {movableFieldIds[0] !== field.id ? <IconButton icon={ArrowUp} label={`${field.name} nach oben`} onClick={() => onStructureChange(moveNoteField(structure, field.id, -1))} /> : null}
                    {movableFieldIds.at(-1) !== field.id ? <IconButton icon={ArrowDown} label={`${field.name} nach unten`} onClick={() => onStructureChange(moveNoteField(structure, field.id, 1))} /> : null}
                  </>
                ) : null}
                <IconButton label={`${field.name} entfernen`} icon={X} onClick={() => onStructureChange(removeNoteField(structure, field.id))} />
                {changed ? <span className="sr-only">geändert</span> : null}
              </div>
            ) : label}
            <RichTextEditor
              value={value.fields[field.id] ?? ""}
              onChange={(html) => updateField(field.id, html)}
              ariaLabel={`Feld ${field.name}`}
              ariaInvalid={Boolean(errors[field.id])}
              imageActions={imageActions}
              toolbarOnFocus
              minHeightClass={field.role === "prompt" || field.role === "answer" ? "min-h-24" : "min-h-16"}
            />
            {interaction.kind === "cloze" && field.role === "prompt" ? (
              <p className="core-caption font-normal text-core-muted">Lücken mit <code>{"{{c1::Begriff}}"}</code> markieren; gleiche Nummern ergeben eine Karte.</p>
            ) : null}
            <FieldError errors={errors} field={field.id} />
          </div>
        );
      })}
      {choiceMode ? (
        <fieldset className="grid gap-3 rounded-control border border-core-border bg-core-surface p-4">
          <legend className="px-1 core-body font-semibold text-core-secondary">Antwortoptionen und {choiceMode === "single" ? "richtige Antwort" : "richtige Antworten"}</legend>
          {options.map((option, index) => (
            <div key={option.id} className="flex min-w-0 items-center gap-2">
              <input type={choiceMode === "single" ? "radio" : "checkbox"} name={choiceMode === "single" ? `correct-option-${note.id}` : undefined} checked={option.correct} disabled={correctnessLocked(index)} onChange={() => toggleCorrect(index)} aria-label={`Option ${index + 1} als richtig markieren`} />
              <input className="min-h-control min-w-0 flex-1 rounded-control border border-core-border px-3" value={option.text} onChange={(event) => updateOptions(options.map((candidate, optionIndex) => optionIndex === index ? { ...candidate, text: event.target.value } : candidate))} aria-label={`Antwortoption ${index + 1}`} aria-invalid={Boolean(errors.options)} />
              <button type="button" onClick={() => removeOption(index)} disabled={options.length <= 2 || correctnessLocked(index)} className="grid size-control place-items-center rounded-control border border-core-border text-core-muted disabled:opacity-40" aria-label={`Antwortoption ${index + 1} entfernen`}><X size={16} aria-hidden="true" /></button>
            </div>
          ))}
          {choiceMode !== "kprim" ? <button type="button" onClick={addOption} className="inline-flex min-h-control w-fit items-center gap-2 rounded-control border border-core-border px-3 core-body font-semibold text-core-action"><PlusSquare size={16} aria-hidden="true" />Option hinzufügen</button> : null}
          <FieldError errors={errors} field="options" />
        </fieldset>
      ) : null}
      {structureEditable ? <NoteBlockControls typeIn={null} fieldRoles={blocks.fieldRoles} onTypeInChange={() => undefined} onAddField={addField} /> : null}
    </div>
  );

  const previewColumn = occlusionImage && interaction.kind === "image-occlusion" ? (
    <div className="grid min-w-0 content-start gap-2" data-testid="note-occlusion">
      <span className="core-body font-semibold text-core-text">Bild und Masken</span>
      <React.Suspense fallback={<p className="core-body text-core-muted" role="status">Masken-Editor wird geladen …</p>}>
        <OcclusionEditor
          imageUrl={occlusionImage}
          imageAlt="Bild der Bildverdeckung"
          masks={interaction.masks}
          mode={interaction.mode}
          disabled={disabled}
          onMasksChange={(masks) => onStructureChange({ ...structure, interaction: { ...interaction, masks } })}
          onModeChange={(mode) => onStructureChange({ ...structure, interaction: { ...interaction, mode } })}
        />
      </React.Suspense>
    </div>
  ) : (
    <section className="grid min-w-0 content-start gap-3" aria-label="Live-Vorschau" data-testid="card-live-preview">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        {previewCards.length > 1 ? (
          <CoreSelect
            ariaLabel="Karte in der Vorschau"
            value={previewCard?.card.id ?? ""}
            options={previewCards.map((entry) => ({ value: entry.card.id, label: entry.label }))}
            onValueChange={(id) => { setPreviewCardId(id); setSide("question"); setRound((current) => current + 1); }}
          />
        ) : <span />}
        <CoreSegmentedControl
          ariaLabel="Kartenseite in der Vorschau"
          className="core-segmented-touch"
          options={SIDE_OPTIONS}
          value={side}
          onValueChange={(next) => {
            if (next === "question") setRound((current) => current + 1);
            setSide(next);
          }}
        />
      </div>
      <div className="core-study-card min-w-0 rounded-panel border border-core-border bg-core-surface px-4 py-6 sm:px-6">
        {previewCard ? (
          <NoteCardContent key={`${round}:${preview.version}`} note={preview.note} card={previewCard.card} surface="preview" mediaUrls={mediaUrls} revealed={side === "answer"} onReveal={() => setSide("answer")} />
        ) : null}
      </div>
    </section>
  );

  return (
    <div className="grid min-w-0 gap-4">
      <CoreSegmentedControl ariaLabel="Ansicht" options={MOBILE_OPTIONS} value={mobileView} onValueChange={setMobileView} className="core-segmented-touch w-full md:hidden" />
      <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={mobileView === "edit" ? "min-w-0" : "hidden min-w-0 md:block"}>{fields}</div>
        <div className={`${mobileView === "preview" ? "min-w-0" : "hidden min-w-0 md:block"} md:sticky md:top-0 md:self-start`}>{previewColumn}</div>
      </div>
    </div>
  );
}
