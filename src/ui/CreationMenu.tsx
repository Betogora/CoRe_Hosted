import React from "react";
import { SlidersHorizontal, type LucideIcon } from "lucide-react";
import { ActionButton } from "./actionUi.tsx";
import { StatusMessage } from "./feedbackUi.tsx";

interface CreationMenuTileProps {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
}

export function CreationMenu({ children }: { children: React.ReactNode }) {
  return <div className="core-creation-menu">{children}</div>;
}

function Tile({ icon: Icon, label, ...props }: CreationMenuTileProps & React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> }) {
  return <button type="button" className="core-creation-menu-action" {...props}><span className="core-creation-menu-icon" aria-hidden="true"><Icon size={20} /></span><span>{label}</span></button>;
}

export function CreationMenuAction({ onSelect, ...tile }: CreationMenuTileProps & { onSelect: () => void }) {
  return <Tile {...tile} onClick={onSelect} />;
}

interface CreationMenuWait {
  message: string;
  /** Without it the wait shows no bar. */
  progress?: { done: number; total: number };
  onCancel: () => void;
}

export function CreationMenuForm({ open, onOpenChange, triggerRef, formRef, busy = false, wait = null, advanced, advancedOpen, onAdvancedOpenChange, error = "", submitLabel, submitIcon, onSubmit, children, ...tile }: CreationMenuTileProps & {
  open: boolean;
  /** Tile, Escape and `Abbrechen` ask to close; the caller may hold the form open, for example over unsaved input. */
  onOpenChange: (open: boolean) => void;
  triggerRef?: React.Ref<HTMLButtonElement>;
  formRef?: React.Ref<HTMLDivElement>;
  /** Locks the fields while the caller reads or saves. */
  busy?: boolean;
  /** A running creation replaces the fields. */
  wait?: CreationMenuWait | null;
  advanced: React.ReactNode;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  error?: string;
  submitLabel: string;
  submitIcon: LucideIcon;
  onSubmit: () => void;
  /** Fields share a row while they fit; `core-creation-menu-wide` gives one the whole row. */
  children: React.ReactNode;
}) {
  const id = React.useId();
  return <div className="core-creation-menu-entry">
    <Tile {...tile} ref={triggerRef} aria-expanded={open} aria-controls={`${id}-form`} onClick={() => onOpenChange(!open)} />
    {open ? <div id={`${id}-form`} ref={formRef} className="core-creation-menu-form" role="group" aria-label={tile.label} onKeyDown={(event) => {
      if (event.key === "Escape" && !event.defaultPrevented && !wait) { event.preventDefault(); event.stopPropagation(); onOpenChange(false); }
    }}>
      {wait ? <div className="core-creation-menu-wait">
        <StatusMessage tone="info" announce="polite" className="core-creation-menu-wait-message">{wait.message}</StatusMessage>
        {wait.progress ? <div className="core-creation-menu-wait-progress h-1.5 overflow-hidden rounded-round bg-core-subtle" role="progressbar" aria-label="Fortschritt der Erstellung" aria-valuemin={0} aria-valuemax={wait.progress.total} aria-valuenow={wait.progress.done}>
          <div className="h-full rounded-round bg-core-action transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${wait.progress.total ? wait.progress.done / wait.progress.total * 100 : 0}%` }} aria-hidden="true" />
        </div> : null}
        <ActionButton variant="secondary" onClick={wait.onCancel}>Abbrechen</ActionButton>
      </div> : <form className="grid min-w-0 gap-4" inert={busy} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div className="core-creation-menu-fields">{children}</div>
        {advancedOpen ? <div id={`${id}-advanced`} className="core-creation-menu-fields">{advanced}</div> : null}
        {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
        <div className="core-creation-menu-footer">
          <button type="button" aria-expanded={advancedOpen} aria-controls={`${id}-advanced`} onClick={() => onAdvancedOpenChange(!advancedOpen)} className="core-action-secondary shrink-0 gap-2 aria-expanded:border-core-action aria-expanded:bg-[var(--core-action-soft)] aria-expanded:text-core-action"><SlidersHorizontal size={16} aria-hidden="true" />Erweiterte Einstellungen</button>
          <div className="core-creation-menu-submit flex gap-3"><ActionButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>Abbrechen</ActionButton><ActionButton variant="primary" type="submit" icon={submitIcon}>{submitLabel}</ActionButton></div>
        </div>
      </form>}
    </div> : null}
  </div>;
}
