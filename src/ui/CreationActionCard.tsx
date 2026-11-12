import type { LucideIcon } from "lucide-react";

export interface CreationActionCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  onSelect: () => unknown;
}

/** Flat lying action card: free icon on the left, title on the first line, so titles in a grid share one baseline. */
export function CreationActionCard({ title, description, icon: Icon, onSelect }: CreationActionCardProps) {
  return (
    <button type="button" onClick={onSelect} className="grid grid-cols-[auto_minmax(0,1fr)] content-start items-start gap-3.5 rounded-control border border-core-border bg-core-surface px-5 py-6 text-left transition-colors hover:border-core-border-strong hover:bg-core-subtle">
      <Icon size={24} className="text-core-action" aria-hidden="true" />
      <span className="grid gap-1">
        <span className="block max-w-full break-words core-heading-3 text-core-text">{title}</span>
        {description && <span className="block core-body text-core-secondary">{description}</span>}
      </span>
    </button>
  );
}
