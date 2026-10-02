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
    <button type="button" onClick={onSelect} className={`core-creation-action group grid content-start rounded-[18px] border border-[var(--core-border)] bg-core-surface px-5 py-6 text-center shadow-[var(--core-shadow-soft)] transition duration-200 hover:-translate-y-1 hover:shadow-[var(--core-shadow-raised)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] ${tone === "info" ? "hover:border-core-info" : "hover:border-core-success"}`}>
      <span className={`core-creation-action-icon mx-auto grid size-16 place-items-center rounded-full text-core-text shadow-[var(--core-shadow-soft)] ${iconBackground}`}>
        <Icon size={28} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="core-creation-action-title mx-auto mt-4 block max-w-full font-display text-[1.375rem] font-bold leading-[1.875rem] text-[var(--core-text)] sm:text-[1.75rem] sm:leading-9">{title}</span>
      {description && <span className="core-creation-action-description mt-2 block core-body text-[var(--core-text-muted)]">{description}</span>}
    </button>
  );
}
