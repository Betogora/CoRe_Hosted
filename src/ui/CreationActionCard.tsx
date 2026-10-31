import type { LucideIcon } from "lucide-react";

export interface CreationActionCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  onSelect: () => unknown;
}

export function CreationActionCard({ title, description, icon: Icon, onSelect }: CreationActionCardProps) {
  return (
    <button type="button" onClick={onSelect} className="core-creation-action group grid content-start gap-3 rounded-panel border border-core-border bg-core-surface p-5 text-left shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-core-focus md:min-h-40 md:content-between">
      <span className="core-creation-action-icon grid size-12 place-items-center rounded-control bg-core-subtle text-core-action transition-colors duration-200 group-hover:bg-core-action group-hover:text-core-on-accent">
        <Icon size={24} aria-hidden="true" />
      </span>
      <span className="grid gap-1">
        <span className="core-creation-action-title block max-w-full core-heading-3 text-core-text transition-colors duration-200 group-hover:text-core-action">{title}</span>
        {description && <span className="core-creation-action-description block core-body text-core-secondary">{description}</span>}
      </span>
    </button>
  );
}
