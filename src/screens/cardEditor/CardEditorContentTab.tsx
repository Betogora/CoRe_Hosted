import React from "react";
import { Save, Trash2, Undo2 } from "lucide-react";
import type { CardDraftGuard, CardEditorServices } from "../../appScreenProps.ts";
import { noteContentMediaRefs, noteEditorValue, notePromptLabel, planNoteContentChange, validateNoteEditorValue, type NoteEditorErrors, type NoteEditorValue } from "../../coreModel.ts";
import type { Card, NoteContent } from "../../coreTypes.ts";
import type { ManualImageAttachment } from "../../creationWorkflow.ts";
import type { AccountMediaStore } from "../../mediaStore.ts";
import type { NoteGraph } from "../../workspaceReplica.ts";
import { ActionButton } from "../../ui/actionUi.tsx";
import { ActionDialog } from "../../ui/coreUi.tsx";
import { useSuccessToast } from "../../ui/feedbackUi.tsx";
import type { RichTextImageActions } from "../../ui/RichTextEditor.tsx";
import { CoreTooltip } from "../../ui/tooltipUi.tsx";
import { cardStateLabel, draftChangeSummary, outdatedVariantCount, removedCardsDescription, type NoteContentPlan } from "./cardEditorModel.ts";
import { NoteContentEditor, type PreviewCard } from "./NoteContentEditor.tsx";

/** Image preparation and local storage of the creation workflow, loaded only when an image is inserted or saved. */
const loadImageWorkflow = async (mediaStore: AccountMediaStore) => (await import("../../creationWorkflow.ts")).createCreationWorkflow({ mediaStore });

/** A prompt that saving the draft would add, shown as „Neu beim Speichern“ in `Allgemein`. */
export interface PendingCard {
  promptKey: string;
  label: string;
}

/** Fields, options and structure of the draft; tags are no part of it (they save at once in `Allgemein`). */
function draftKey(value: NoteEditorValue, structure: NoteContent) {
  return JSON.stringify([value.fields, value.options, structure.fields.map(({ id, name, role }) => [id, name, role]), structure.interaction]);
}

/**
 * While the draft is unchanged it follows the stored content; once edited it keeps the graph it started from, so a
 * newer version arriving by sync meets the existing conflict handling on save instead of being overwritten (W19).
 */
export function draftBaseGraph(current: NoteGraph, base: NoteGraph, dirty: boolean): NoteGraph {
  return dirty && base.note.id === current.note.id ? base : current;
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

/** Files of the content (`Note.media`); sizes only where the local copy is known, unused files can go. */
function NoteMediaList({ graph, mediaUrls, services }: { graph: NoteGraph; mediaUrls: Record<string, string>; services: CardEditorServices }) {
  const [sizes, setSizes] = React.useState<Record<string, number>>({});
  const [removing, setRemoving] = React.useState("");
  const names = Object.keys(graph.note.media).sort((left, right) => left.localeCompare(right, "de"));
  const used = React.useMemo(() => new Set(noteContentMediaRefs(graph.note.content)), [graph.note.content]);
  React.useEffect(() => {
    let active = true;
    for (const [name, url] of Object.entries(mediaUrls)) {
      if (!url.startsWith("blob:")) continue;
      void fetch(url).then((response) => response.blob()).then((blob) => {
        if (active) setSizes((current) => current[name] === blob.size ? current : { ...current, [name]: blob.size });
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [mediaUrls]);
  if (!names.length) return null;
  return (
    <section className="grid min-w-0 gap-2 rounded-panel border border-core-border bg-core-surface p-4" aria-labelledby="card-media-heading" data-testid="card-media">
      <h3 id="card-media-heading" className="core-body font-semibold text-core-text">Medien</h3>
      <ul className="grid divide-y divide-core-border">
        {names.map((name) => (
          <li key={name} className="flex min-h-control min-w-0 items-center gap-3 py-1 core-body">
            <span className="min-w-0 flex-1 truncate text-core-text">{name}</span>
            {sizes[name] !== undefined ? <span className="shrink-0 core-caption tabular-nums text-core-muted">{formatBytes(sizes[name])}</span> : null}
            {used.has(name) ? null : (
              <>
                <span className="shrink-0 core-caption text-core-muted">nicht verwendet</span>
                <CoreTooltip label="Entfernen">
                  <button type="button" aria-label={`${name} entfernen`} disabled={removing === name} className="core-action-ghost min-w-control p-2 text-core-danger-text" onClick={() => {
                    setRemoving(name);
                    void services.removeNoteMedia(graph, [name]).finally(() => setRemoving(""));
                  }}>
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </CoreTooltip>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface CardEditorContentTabProps {
  graph: NoteGraph;
  card: Card;
  mediaUrls: Record<string, string>;
  mediaStore: AccountMediaStore | null;
  dayStartHour?: number;
  timeZone?: string;
  active: boolean;
  services: CardEditorServices;
  onSaveNote: (graph: NoteGraph, content: NoteContent) => Promise<unknown>;
  onPendingCardsChange: (cards: PendingCard[]) => void;
  deckName: (deckId: string) => string;
  onDraftStateChange: (guard: CardDraftGuard | null) => void;
}

/** `Inhalt` is the draft: fields and live preview, the footer names the effect before `Verwerfen` and `Speichern`. */
export function CardEditorContentTab({ graph, card, mediaUrls, mediaStore, dayStartHour, timeZone, active, services, onSaveNote, onPendingCardsChange, deckName, onDraftStateChange }: CardEditorContentTabProps) {
  const { note } = graph;
  const [form, setForm] = React.useState<NoteEditorValue>(() => noteEditorValue(note));
  const [structure, setStructure] = React.useState(note.content);
  const [base, setBase] = React.useState(graph);
  const savedKey = React.useMemo(() => draftKey(noteEditorValue(base.note), base.note.content), [base]);
  const dirty = draftKey(form, structure) !== savedKey;
  const baseGraph = draftBaseGraph(graph, base, dirty);
  const [fieldErrors, setFieldErrors] = React.useState<NoteEditorErrors>({});
  const [saveStatus, setSaveStatus] = React.useState("");
  const [saveError, setSaveError] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [pendingRemoval, setPendingRemoval] = React.useState<{ content: NoteContent; plan: NoteContentPlan; outdated: number } | null>(null);
  const setSuccessToast = useSuccessToast();
  const saveRef = React.useRef<() => Promise<boolean>>(async () => false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const labelOptions = { dayStartHour, timeZone };

  // An unchanged draft follows the stored content (also synced versions); an edited one keeps its base.
  React.useLayoutEffect(() => {
    if (dirty && base.note.id === graph.note.id) return;
    setBase(graph);
    setForm(noteEditorValue(graph.note));
    setStructure(graph.note.content);
    setFieldErrors({});
  }, [graph]);

  const imageDraftsRef = React.useRef(new Map<string, { attachment: ManualImageAttachment; previewUrl: string }>());
  const [imageDraftVersion, setImageDraftVersion] = React.useState(0);
  React.useEffect(() => () => {
    for (const draft of imageDraftsRef.current.values()) URL.revokeObjectURL(draft.previewUrl);
  }, []);
  const editorMediaUrls = React.useMemo(() => ({ ...mediaUrls, ...Object.fromEntries([...imageDraftsRef.current].map(([sha1, draft]) => [sha1, draft.previewUrl])) }), [imageDraftVersion, mediaUrls]);
  const imageActions = React.useMemo<RichTextImageActions | undefined>(() => mediaStore ? {
    mediaUrls: editorMediaUrls,
    async prepare(file) {
      const attachment = await (await loadImageWorkflow(mediaStore)).prepareManualImage(file);
      const existing = imageDraftsRef.current.get(attachment.sha1);
      const previewUrl = existing?.previewUrl ?? URL.createObjectURL(attachment.blob);
      if (!existing) {
        imageDraftsRef.current.set(attachment.sha1, { attachment, previewUrl });
        setImageDraftVersion((version) => version + 1);
      }
      return { reference: attachment.sha1, previewUrl, alt: attachment.originalName };
    },
  } : undefined, [editorMediaUrls, mediaStore]);

  // Tags are not part of the draft: the stored ones always apply.
  const draftValue = React.useMemo(() => ({ ...form, tags: graph.note.content.tags }), [form, graph.note.content.tags]);
  const draftNote = React.useMemo(() => ({ ...baseGraph.note, content: { ...structure, tags: graph.note.content.tags } }), [baseGraph.note, graph.note.content.tags, structure]);
  const plan = React.useMemo(() => {
    if (!dirty) return null;
    const validation = validateNoteEditorValue(draftNote, draftValue);
    if (!validation.ok) return null;
    try {
      return planNoteContentChange(baseGraph, validation.content);
    } catch {
      return null;
    }
  }, [baseGraph, dirty, draftNote, draftValue]);
  const summary = plan ? draftChangeSummary(baseGraph, plan) : null;
  const pendingKey = plan?.newCards.map((candidate) => candidate.promptKey).join("|") ?? "";
  React.useEffect(() => {
    onPendingCardsChange(plan ? plan.newCards.map((candidate) => ({ promptKey: candidate.promptKey, label: notePromptLabel(plan.note.content, candidate.promptKey) })) : []);
  }, [pendingKey]);
  React.useEffect(() => () => onPendingCardsChange([]), [onPendingCardsChange]);

  const changedFieldIds = React.useMemo(() => {
    const saved = noteEditorValue(base.note).fields;
    return new Set(structure.fields.filter((field) => (form.fields[field.id] ?? "") !== (saved[field.id] ?? "")).map((field) => field.id));
  }, [base.note, form.fields, structure.fields]);
  const siblings = graph.cards.filter((candidate) => candidate.deletedAt === null);
  const previewCards = React.useMemo<PreviewCard[]>(() => [
    ...siblings.map((sibling) => ({ card: sibling, label: notePromptLabel(note.content, sibling.promptKey) })),
    ...(plan?.newCards ?? []).map((created) => ({ card: created, label: `${notePromptLabel(plan!.note.content, created.promptKey)} · Neu beim Speichern` })),
  ], [note.content, pendingKey, graph.cards]);

  const focusDraft = React.useCallback(() => containerRef.current?.querySelector<HTMLElement>('[role="textbox"]')?.focus(), []);
  React.useEffect(() => {
    onDraftStateChange(dirty ? { focus: focusDraft, save: () => saveRef.current() } : null);
  }, [dirty, focusDraft, onDraftStateChange]);
  React.useEffect(() => () => onDraftStateChange(null), [onDraftStateChange]);

  function clearStatus() {
    setSaveStatus("");
    setSaveError(false);
  }

  function discard() {
    setForm(noteEditorValue(graph.note));
    setStructure(graph.note.content);
    setBase(graph);
    setFieldErrors({});
    clearStatus();
  }

  /** The saved content is the new base until the stored graph arrives through the props. */
  function adoptSaved(saved: NoteContentPlan) {
    setBase({ note: saved.note, cards: [...saved.keptCards, ...saved.newCards] });
    setForm(noteEditorValue(saved.note));
    setStructure(saved.note.content);
  }

  async function persist(content: NoteContent, saved: NoteContentPlan, outdated: number): Promise<boolean> {
    setIsSaving(true);
    setSaveError(false);
    setSaveStatus("Karte wird gespeichert …");
    try {
      const html = content.fields.map((field) => field.html).join(" ");
      const newImages = [...imageDraftsRef.current].filter(([sha1]) => html.includes(sha1) && !baseGraph.note.media[sha1]).map(([, draft]) => draft.attachment);
      if (newImages.length && mediaStore) await (await loadImageWorkflow(mediaStore)).prepareManualMedia(newImages);
      await onSaveNote(baseGraph, content);
      adoptSaved(saved);
      setFieldErrors({});
      setSaveStatus("");
      setSuccessToast(outdated === 0
        ? "Karte wurde erfolgreich gespeichert."
        : `Karte wurde erfolgreich gespeichert. ${outdated === 1 ? "1 Variante ist veraltet und wird nicht mehr abgefragt." : `${outdated} Varianten sind veraltet und werden nicht mehr abgefragt.`}`);
      return true;
    } catch {
      setSaveError(true);
      setSaveStatus("Die Karte konnte nicht gespeichert werden. Deine Eingaben bleiben im Editor – bitte erneut versuchen.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    const validation = validateNoteEditorValue(draftNote, draftValue);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      setSaveError(true);
      setSaveStatus(validation.errors.form ?? "Bitte die markierten Felder prüfen.");
      return false;
    }
    const next = planNoteContentChange(baseGraph, validation.content);
    if (!next.changed) {
      discard();
      return true;
    }
    const outdated = outdatedVariantCount(baseGraph, next);
    if (next.removedCards.length > 0) {
      setPendingRemoval({ content: validation.content, plan: next, outdated });
      return false;
    }
    return persist(validation.content, next, outdated);
  }
  saveRef.current = save;

  return (
    <div ref={containerRef} className="flex min-h-full min-w-0 flex-col" data-testid="card-content-tab">
      <div className="grid min-w-0 flex-1 content-start gap-6 p-4 sm:p-6">
        <NoteContentEditor
          note={baseGraph.note}
          value={form}
          structure={structure}
          onValueChange={(update, changedKey) => {
            setForm(update);
            setFieldErrors((current) => ({ ...current, [changedKey]: "", form: "" }));
            clearStatus();
          }}
          onStructureChange={(next, addedFieldId) => {
            setStructure(next);
            const ids = new Set(next.fields.map((field) => field.id));
            setForm((current) => ({ ...current, fields: { ...Object.fromEntries(Object.entries(current.fields).filter(([id]) => ids.has(id))), ...(addedFieldId ? { [addedFieldId]: "" } : {}) } }));
            clearStatus();
          }}
          errors={fieldErrors}
          changedFieldIds={changedFieldIds}
          previewCards={previewCards}
          initialPreviewCardId={card.id}
          mediaUrls={editorMediaUrls}
          imageActions={imageActions}
          structureEditable={note.importedContentRevision === null}
          disabled={isSaving}
        />
        <NoteMediaList graph={graph} mediaUrls={mediaUrls} services={services} />
      </div>
      {active ? (
        <footer className="sticky bottom-0 z-10 flex min-w-0 flex-wrap items-center gap-3 border-t border-core-border bg-core-raised px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6" data-testid="card-draft-footer">
          <p className={`min-w-0 flex-1 basis-64 core-body ${saveError ? "core-status-error" : "text-core-secondary"}`} role={saveError ? "alert" : "status"} aria-live="polite" data-testid="draft-change-summary">
            {saveStatus || summary || (dirty ? "Ungespeicherte Änderungen." : "")}
          </p>
          <div className="ml-auto flex shrink-0 gap-2">
            <ActionButton variant="secondary" icon={Undo2} disabled={!dirty || isSaving} onClick={discard}>Verwerfen</ActionButton>
            <CoreTooltip label="Speichern · Strg+Enter">
              <ActionButton variant="primary" icon={Save} loading={isSaving} disabled={!dirty} onClick={() => void save()}>Speichern</ActionButton>
            </CoreTooltip>
          </div>
        </footer>
      ) : null}
      <ActionDialog
        open={Boolean(pendingRemoval)}
        title="Karten entfernen?"
        description={pendingRemoval ? (
          <>
            <p>{removedCardsDescription(pendingRemoval.plan.removedCards.length)}</p>
            <ul className="mt-3 grid gap-1.5" data-testid="removed-cards">
              {pendingRemoval.plan.removedCards.map((removed) => (
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
          void persist(removal.content, removal.plan, removal.outdated).then(() => setPendingRemoval(null));
        }}
      />
    </div>
  );
}
