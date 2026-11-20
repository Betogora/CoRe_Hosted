import { Plus } from "lucide-react";
import type { AddableFieldRole } from "../coreModel.ts";
import { CoreTooltip } from "./tooltipUi.tsx";

export interface NoteBlockControlsProps {
  fieldRoles: readonly AddableFieldRole[];
  onAddField: (role: AddableFieldRole) => void;
}

export const NOTE_FIELD_ROLE_LABELS: Record<AddableFieldRole, string> = { prompt: "Zusatzfrage", hint: "Hinweis", extra: "Zusatz", source: "Quelle" };

const FIELD_DESCRIPTIONS: Record<AddableFieldRole, string> = {
  prompt: "Weiteres Feld auf der Fragenseite.",
  hint: "Aufklappbarer Tipp vor dem Aufdecken.",
  extra: "Erscheint nach dem Aufdecken unter der Antwort.",
  source: "Quellenangabe oder Link unter der Antwort.",
};

/** Building blocks shared by manual creation and the card editor: fields with a role to add. */
export function NoteBlockControls({ fieldRoles, onAddField }: NoteBlockControlsProps) {
  return (
    <div className="core-note-blocks grid min-w-0 gap-2" data-testid="note-blocks">
      <span className="core-field-label">Bausteine</span>
      <div className="core-note-blocks-grid" role="group" aria-label="Bausteine">
        {fieldRoles.map((role) => (
          <CoreTooltip key={role} label={FIELD_DESCRIPTIONS[role]}>
            <button type="button" onClick={() => onAddField(role)} className="core-action-secondary">
              <Plus size={16} aria-hidden="true" />
              {NOTE_FIELD_ROLE_LABELS[role]}
            </button>
          </CoreTooltip>
        ))}
      </div>
    </div>
  );
}
