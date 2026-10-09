import type { LucideIcon } from "lucide-react";

export interface CreationActionCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  tone: "info" | "success";
  onSelect: () => unknown;
}

export function CreationActionCard({ title, description, icon: Icon, tone, onSelect }: CreationActionCardProps) {
  const iconBackground = tone === "info"
    ? "bg-core-info-soft"
    : "bg-core-success-soft";
  return (
    <button type="button" onClick={onSelect} className="core-creation-action group grid content-start rounded-panel border border-core-border bg-core-surface p-5 text-left shadow-soft transition-colors duration-150 hover:border-core-border-strong hover:bg-core-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-core-focus">
      <span className={`core-creation-action-icon grid size-11 place-items-center rounded-control text-core-text ${iconBackground}`}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="core-creation-action-title mt-5 block max-w-full text-[1.25rem] font-semibold leading-tight tracking-[-0.01em] text-core-text">{title}</span>
      {description && <span className="core-creation-action-description mt-2 block core-body text-core-muted">{description}</span>}
    </button>
  );
}
