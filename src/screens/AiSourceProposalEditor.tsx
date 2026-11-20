import React from "react";
import { createNote, noteEditorValue, notePromptLabel, planNoteContentChange, validateNoteEditorValue, type NoteEditorErrors } from "../coreModel.ts";
import type { NoteContent } from "../coreTypes.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { ActionDialog } from "../ui/coreUi.tsx";
import { DialogFrame } from "../ui/DialogFrame.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { valueForStructure } from "./cardEditor/cardEditorModel.ts";
import { NoteContentEditor } from "./cardEditor/NoteContentEditor.tsx";

const NO_CHANGED_FIELDS = new Set<string>();

export function AiSourceProposalEditor({ content, onCancel, onApply }: {
  content: NoteContent;
  onCancel: () => void;
  onApply: (content: NoteContent) => void;
}) {
  // A transient note gives the editor its structure and the preview its cards; it never reaches the repository.
  const graph = React.useMemo(() => createNote({ content, deckId: "ai-source-proposal", source: "manual" }), [content]);
  const initial = React.useMemo(() => JSON.stringify([noteEditorValue(graph.note), graph.note.content]), [graph]);
  const [value, setValue] = React.useState(() => noteEditorValue(graph.note));
  const [structure, setStructure] = React.useState(graph.note.content);
  const [errors, setErrors] = React.useState<NoteEditorErrors>({});
  const [confirmClose, setConfirmClose] = React.useState(false);
  const note = React.useMemo(() => ({ ...graph.note, content: structure }), [graph.note, structure]);
  const dirty = JSON.stringify([value, structure]) !== initial;
  const previewCards = React.useMemo(() => {
    const validation = validateNoteEditorValue(note, value);
    let added: ReturnType<typeof planNoteContentChange>["newCards"] = [];
    if (validation.ok) {
      try { added = planNoteContentChange(graph, validation.content).newCards; } catch { added = []; }
    }
    return [...graph.cards, ...added].map((card) => ({ card, label: notePromptLabel(validation.ok ? validation.content : graph.note.content, card.promptKey) }));
  }, [graph, note, value]);

  function apply() {
    const validation = validateNoteEditorValue(note, value);
    if (!validation.ok) { setErrors(validation.errors); return; }
    onApply(validation.content);
  }

  function close() {
    if (dirty) setConfirmClose(true);
    else onCancel();
  }

  return (
    <>
      <DialogFrame
        open
        size="l"
        title="Vorschlag bearbeiten"
        onClose={close}
        testId="ai-source-proposal-editor"
        footer={(
          <div className="flex flex-wrap justify-end gap-3">
            <ActionButton type="button" variant="secondary" onClick={close}>Abbrechen</ActionButton>
            <ActionButton type="button" variant="primary" onClick={apply}>Änderungen übernehmen</ActionButton>
          </div>
        )}
      >
        {errors.form ? <StatusMessage tone="error" announce="assertive" className="mb-4">{errors.form}</StatusMessage> : null}
        <NoteContentEditor
          note={note}
          value={value}
          structure={structure}
          onValueChange={(update, changedKey) => {
            setValue(update);
            setErrors((current) => ({ ...current, [changedKey]: "", form: "" }));
          }}
          onStructureChange={(next, addedFieldId) => {
            setStructure(next);
            setValue((current) => valueForStructure(current, next, addedFieldId));
          }}
          errors={errors}
          changedFieldIds={NO_CHANGED_FIELDS}
          previewCards={previewCards}
          initialPreviewCardId={graph.cards[0]?.id ?? ""}
          mediaUrls={{}}
          structureEditable
        />
      </DialogFrame>
      <ActionDialog
        open={confirmClose}
        destructive
        title="Änderungen verwerfen?"
        description="Die Änderungen an diesem Vorschlag gehen verloren."
        confirmLabel="Verwerfen"
        cancelLabel="Weiter bearbeiten"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => { setConfirmClose(false); onCancel(); }}
      />
    </>
  );
}
