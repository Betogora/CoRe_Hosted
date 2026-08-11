import { ChevronRight, type LucideIcon } from "lucide-react";

export type SettingsSectionTone = "info" | "success" | "warning";

interface SettingsSectionItemBase {
  id: string;
  title: string;
  status: string;
  icon: LucideIcon;
  tone: SettingsSectionTone;
}

export type SettingsSectionItem = SettingsSectionItemBase & (
  | { href: string; onSelect?: never }
  | { href?: never; onSelect: () => void }
);

export interface SettingsSectionNavigationProps {
  ariaLabel: string;
  items: readonly SettingsSectionItem[];
  className?: string;
}

const toneClasses: Record<SettingsSectionTone, string> = {
  info: "border-core-info bg-core-info-soft",
  success: "border-core-success bg-core-success-soft",
  warning: "border-core-warning bg-core-warning-soft",
};

const sectionClassName = "group flex h-full min-h-28 w-full items-start gap-3 rounded-2xl border px-4 py-4 text-left text-core-text transition hover:-translate-y-0.5 hover:shadow-[var(--core-shadow-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2";

function SettingsSectionContent({ icon: Icon, title, status }: Pick<SettingsSectionItemBase, "icon" | "title" | "status">) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-core-surface text-core-action shadow-sm">
        <Icon size={19} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block core-body-large font-semibold">{title}</span>
        <span className="mt-1 block core-caption leading-5 text-core-muted">{status}</span>
      </span>
      <ChevronRight className="mt-2 shrink-0 text-core-action transition-transform group-hover:translate-x-0.5" size={17} aria-hidden="true" />
    </>
  );
}

export function SettingsSectionNavigation({ ariaLabel, items, className = "" }: SettingsSectionNavigationProps) {
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul className="grid gap-3 md:grid-cols-3">
        {items.map((item) => {
          const itemClassName = `${sectionClassName} ${toneClasses[item.tone]}`;
          const content = <SettingsSectionContent icon={item.icon} title={item.title} status={item.status} />;

          return (
            <li key={item.id} className="min-w-0">
              {item.href ? (
                <a href={item.href} className={itemClassName}>
                  {content}
                </a>
              ) : (
                <button type="button" onClick={item.onSelect} className={itemClassName}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
