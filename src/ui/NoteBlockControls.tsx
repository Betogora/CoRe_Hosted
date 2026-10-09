import { BookOpen, Check, Keyboard, Lightbulb, MessageSquarePlus, Plus, StickyNote, type LucideIcon } from "lucide-react";
import type { AddableFieldRole } from "../coreModel.ts";

export interface NoteBlockControlsProps {
  /** Null where the content cannot type its answer (cloze, choice, imported structures). */
  typeIn: boolean | null;
  fieldRoles: readonly AddableFieldRole[];
  onTypeInChange: (enabled: boolean) => void;
  onAddField: (role: AddableFieldRole) => void;
}

export const NOTE_FIELD_ROLE_LABELS: Record<AddableFieldRole, string> = { prompt: "Zusatzfrage", hint: "Hinweis", extra: "Zusatz", source: "Quelle" };

const FIELD_BLOCKS: Record<AddableFieldRole, { icon: LucideIcon; description: string }> = {
  prompt: { icon: MessageSquarePlus, description: "Weiteres Feld auf der Fragenseite." },
  hint: { icon: Lightbulb, description: "Aufklappbarer Tipp vor dem Aufdecken." },
  extra: { icon: StickyNote, description: "Erscheint nach dem Aufdecken unter der Antwort." },
  source: { icon: BookOpen, description: "Quellenangabe oder Link unter der Antwort." },
};

const TYPE_IN = { label: "Antwort eintippen", icon: Keyboard, description: "Die Antwort wird eingetippt und Zeichen für Zeichen verglichen." };

/** Building blocks shared by manual creation and the card editor: answer typing and fields with a role. */
export function NoteBlockControls({ typeIn, fieldRoles, onTypeInChange, onAddField }: NoteBlockControlsProps) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-[max-content_minmax(0,1fr)] sm:items-center sm:gap-3" data-testid="note-blocks">
      <span className="core-body font-semibold text-core-text">Bausteine</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Bausteine">
        {typeIn !== null ? (
          <button
            type="button"
            aria-pressed={typeIn}
            title={TYPE_IN.description}
            onClick={() => onTypeInChange(!typeIn)}
            className="core-action-secondary aria-pressed:border-core-action aria-pressed:bg-[var(--core-action-soft)] aria-pressed:text-core-action"
          >
            {typeIn ? <Check size={16} aria-hidden="true" /> : <TYPE_IN.icon size={16} aria-hidden="true" />}
            {TYPE_IN.label}
          </button>
        ) : null}
        {fieldRoles.map((role) => {
          const { icon: Icon, description } = FIELD_BLOCKS[role];
          return (
            <button key={role} type="button" title={description} onClick={() => onAddField(role)} className="core-action-ghost">
              <Plus size={16} aria-hidden="true" />
              <Icon size={16} aria-hidden="true" />
              {NOTE_FIELD_ROLE_LABELS[role]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
