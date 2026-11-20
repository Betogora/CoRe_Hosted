import { BookOpen, Lightbulb, MessageSquarePlus, Plus, StickyNote, type LucideIcon } from "lucide-react";
import type { AddableFieldRole } from "../coreModel.ts";
import { CoreTooltip } from "./tooltipUi.tsx";

export interface NoteBlockControlsProps {
  fieldRoles: readonly AddableFieldRole[];
  onAddField: (role: AddableFieldRole) => void;
}

export const NOTE_FIELD_ROLE_LABELS: Record<AddableFieldRole, string> = { prompt: "Zusatzfrage", hint: "Hinweis", extra: "Zusatz", source: "Quelle" };

const FIELD_BLOCKS: Record<AddableFieldRole, { icon: LucideIcon; description: string }> = {
  prompt: { icon: MessageSquarePlus, description: "Weiteres Feld auf der Fragenseite." },
  hint: { icon: Lightbulb, description: "Aufklappbarer Tipp vor dem Aufdecken." },
  extra: { icon: StickyNote, description: "Erscheint nach dem Aufdecken unter der Antwort." },
  source: { icon: BookOpen, description: "Quellenangabe oder Link unter der Antwort." },
};

/** Building blocks shared by manual creation and the card editor: fields with a role to add. */
export function NoteBlockControls({ fieldRoles, onAddField }: NoteBlockControlsProps) {
  return (
    <div className="grid min-w-0 gap-2" data-testid="note-blocks">
      <span className="core-field-label">Bausteine</span>
      {/* Equal columns keep the blocks aligned in any width: one on narrow phones, two in the editor pane, a row on wide pages. */}
      <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] items-center gap-x-4 gap-y-1" role="group" aria-label="Bausteine">
        {fieldRoles.map((role) => {
          const { icon: Icon, description } = FIELD_BLOCKS[role];
          return (
            <CoreTooltip key={role} label={description}>
              <button type="button" onClick={() => onAddField(role)} className="core-action-ghost -mx-2 justify-start px-2">
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
