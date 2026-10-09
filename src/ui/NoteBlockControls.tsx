import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { BookOpen, Check, Keyboard, Lightbulb, MessageSquarePlus, Plus, StickyNote, X, type LucideIcon } from "lucide-react";
import type { AddableFieldRole } from "../coreModel.ts";

/** Pending design decision K6.1: switches in the option row or a „Baustein hinzufügen“ menu. */
const NOTE_BLOCK_LAYOUT: "row" | "menu" = "row";

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
  return NOTE_BLOCK_LAYOUT === "row"
    ? <NoteBlockRow typeIn={typeIn} fieldRoles={fieldRoles} onTypeInChange={onTypeInChange} onAddField={onAddField} />
    : <NoteBlockMenu typeIn={typeIn} fieldRoles={fieldRoles} onTypeInChange={onTypeInChange} onAddField={onAddField} />;
}

type BlockProps = NoteBlockControlsProps;

function NoteBlockRow({ typeIn, fieldRoles, onTypeInChange, onAddField }: BlockProps) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-[max-content_minmax(0,1fr)] sm:items-center sm:gap-3" data-testid="note-blocks" data-layout="row">
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

function NoteBlockMenu({ typeIn, fieldRoles, onTypeInChange, onAddField }: BlockProps) {
  const [open, setOpen] = React.useState(false);
  const choose = (apply: () => void) => {
    apply();
    setOpen(false);
  };
  const items = [
    ...(typeIn === false ? [{ key: "type-in", label: TYPE_IN.label, icon: TYPE_IN.icon, description: TYPE_IN.description, apply: () => onTypeInChange(true) }] : []),
    ...fieldRoles.map((role) => ({ key: role, label: NOTE_FIELD_ROLE_LABELS[role], icon: FIELD_BLOCKS[role].icon, description: FIELD_BLOCKS[role].description, apply: () => onAddField(role) })),
  ];
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="note-blocks" data-layout="menu">
      {typeIn ? (
        <span className="inline-flex min-h-control items-center gap-2 rounded-control border border-core-border bg-[var(--core-action-soft)] pl-3 pr-1 core-body font-semibold text-core-action">
          <TYPE_IN.icon size={16} aria-hidden="true" />
          {TYPE_IN.label}
          <button type="button" onClick={() => onTypeInChange(false)} aria-label={`${TYPE_IN.label} entfernen`} className="grid size-8 place-items-center rounded-inset text-core-muted transition-colors hover:bg-core-surface hover:text-core-text">
            <X size={16} aria-hidden="true" />
          </button>
        </span>
      ) : null}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className="core-action-secondary">
            <Plus size={16} aria-hidden="true" />
            Baustein hinzufügen
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={6} className="core-overlay z-[90] grid w-[min(20rem,calc(100vw-1.5rem))] gap-1 rounded-panel border border-core-border bg-core-surface p-2 shadow-raised outline-none" aria-label="Bausteine">
            {items.map(({ key, label, icon: Icon, description, apply }) => (
              <button key={key} type="button" onClick={() => choose(apply)} className="flex min-h-control w-full items-start gap-3 rounded-inset px-3 py-2 text-left transition-colors hover:bg-core-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-core-focus">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-inset bg-core-subtle text-core-action"><Icon size={16} aria-hidden="true" /></span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="core-body font-semibold text-core-text">{label}</span>
                  <span className="core-caption text-core-muted">{description}</span>
                </span>
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
