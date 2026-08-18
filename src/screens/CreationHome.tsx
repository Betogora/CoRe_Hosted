import type { LucideIcon } from "lucide-react";
import { FileSpreadsheet, PenLine } from "lucide-react";
import type { CreationMethod } from "../useAppNavigation.ts";

type SelectableCreationMethod = Exclude<CreationMethod, "">;

export interface CreationMethodDefinition {
  id: SelectableCreationMethod;
  title: string;
  icon: LucideIcon;
  color: "sky" | "teal";
}

export interface CreationHomeProps {
  onSelect: (method: SelectableCreationMethod) => unknown;
}

export const creationMethods: CreationMethodDefinition[] = [
  {
    id: "manual",
    title: "Karten selbst erstellen",
    icon: PenLine,
    color: "sky",
  },
  {
    id: "import",
    title: "Import",
    icon: FileSpreadsheet,
    color: "teal",
  },
];

const methodThemes: Record<CreationMethodDefinition["color"], { icon: string; hover: string }> = {
  sky: {
    icon: "bg-core-info-soft text-core-text shadow-[var(--core-shadow-soft)]",
    hover: "hover:border-core-info hover:shadow-[var(--core-shadow-raised)]",
  },
  teal: {
    icon: "bg-core-success-soft text-core-text shadow-[var(--core-shadow-soft)]",
    hover: "hover:border-core-success hover:shadow-[var(--core-shadow-raised)]",
  },
};

function CreationMethodButton({ method, onSelect }: { method: CreationMethodDefinition; onSelect: () => unknown }) {
  const Icon = method.icon;
  const theme = methodThemes[method.color];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={false}
      className={`group grid content-start rounded-[18px] border border-[var(--core-border)] bg-core-surface px-5 py-6 text-center shadow-[var(--core-shadow-soft)] transition duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] ${theme.hover}`}
    >
      <span className={`mx-auto grid size-16 place-items-center rounded-full ${theme.icon}`}>
        <Icon size={28} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="mx-auto mt-4 block max-w-full whitespace-nowrap font-display text-[1.375rem] font-bold leading-[1.875rem] text-[var(--core-text)] sm:text-[1.75rem] sm:leading-9">{method.title}</span>
    </button>
  );
}

export function CreationHome({ onSelect }: CreationHomeProps) {
  return (
    <section className="grid items-stretch gap-4 md:grid-cols-2" aria-label="Erstellungsart">
      {creationMethods.map((method) => (
        <CreationMethodButton key={method.id} method={method} onSelect={() => onSelect(method.id)} />
      ))}
    </section>
  );
}
