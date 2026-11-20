import { BookOpen, Lightbulb, MessageSquarePlus, Plus, StickyNote, type LucideIcon } from "lucide-react";
import type { AddableFieldRole } from "../coreModel.ts";
import { CoreSwitch } from "./formControls.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";

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

const TYPE_IN_DESCRIPTION = "Die Antwort wird eingetippt und Zeichen für Zeichen verglichen.";

/** Building blocks shared by manual creation and the card editor: answer typing as a switch, fields with a role to add. */
export function NoteBlockControls({ typeIn, fieldRoles, onTypeInChange, onAddField }: NoteBlockControlsProps) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-[max-content_minmax(0,1fr)] sm:items-start sm:gap-3" data-testid="note-blocks">
      <span className="core-field-label sm:flex sm:min-h-button sm:items-center">Bausteine</span>
      {/* Phones set the blocks in columns below the switch; wider rows let them flow side by side. */}
      <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] items-center gap-x-4 gap-y-1 sm:flex sm:flex-wrap sm:gap-2" role="group" aria-label="Bausteine">
        {typeIn !== null ? (
          <CoreTooltip label={TYPE_IN_DESCRIPTION}>
            <CoreSwitch checked={typeIn} onCheckedChange={onTypeInChange} label="Antwort eintippen" className="col-span-full sm:mr-4" />
          </CoreTooltip>
        ) : null}
        {fieldRoles.map((role) => {
          const { icon: Icon, description } = FIELD_BLOCKS[role];
          return (
            <CoreTooltip key={role} label={description}>
              <button type="button" onClick={() => onAddField(role)} className="core-action-ghost -mx-2 justify-start px-2 sm:mx-0 sm:justify-center sm:px-4">
                <Plus size={16} aria-hidden="true" />
                <Icon size={16} aria-hidden="true" />
                {NOTE_FIELD_ROLE_LABELS[role]}
              </button>
            </CoreTooltip>
          );
        })}
      </div>
    </div>
  );
}
