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
    <button type="button" onClick={onSelect} className={`core-creation-action group grid content-start rounded-panel border border-core-border bg-core-surface px-6 py-6 text-center shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-core-focus ${tone === "info" ? "hover:border-core-info" : "hover:border-core-success"}`}>
      <span className={`core-creation-action-icon mx-auto grid size-16 place-items-center rounded-round text-core-text shadow-soft ${iconBackground}`}>
        <Icon size={28} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="core-creation-action-title mx-auto mt-4 block max-w-full core-heading-3 !font-bold text-core-text">{title}</span>
      {description && <span className="core-creation-action-description mt-2 block core-body text-core-muted">{description}</span>}
    </button>
  );
}
