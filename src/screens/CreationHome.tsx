import type { LucideIcon } from "lucide-react";
import { FileSpreadsheet, PenLine } from "lucide-react";
import type { CreationMethod } from "../useAppNavigation.ts";

type SelectableCreationMethod = Exclude<CreationMethod, "">;

export interface CreationMethodDefinition {
  id: SelectableCreationMethod;
  title: string;
  eyebrow: string;
  body: string;
  icon: LucideIcon;
  color: "sky" | "teal";
}

export interface CreationHomeProps {
  onSelect: (method: SelectableCreationMethod) => unknown;
}

export const creationMethods: CreationMethodDefinition[] = [
  {
    id: "manual",
    title: "Karten manuell erstellen",
    eyebrow: "Core · Manuell + PDF/Text",
    body: "Schreibe Karten selbst und füge bei Bedarf eine PDF- oder Textquelle an.",
    icon: PenLine,
    color: "sky",
  },
  {
    id: "import",
    title: "Import",
    eyebrow: "Core · APKG, Text, Tabellen",
    body: "Übernimm bestehende Stapel oder Front/Back-Listen aus Dateien und Tabellen.",
    icon: FileSpreadsheet,
    color: "teal",
  },
];

const methodThemes: Record<CreationMethodDefinition["color"], { eyebrow: string; icon: string; hover: string }> = {
  sky: {
    eyebrow: "text-core-text",
    icon: "bg-core-info-soft text-core-text shadow-[var(--core-shadow-soft)]",
    hover: "hover:border-core-info hover:shadow-[var(--core-shadow-raised)]",
  },
  teal: {
    eyebrow: "text-core-text",
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
      className={`group grid min-h-60 content-start rounded-[18px] border border-[var(--core-border)] bg-core-surface px-5 py-6 text-center shadow-[var(--core-shadow-soft)] transition duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] ${theme.hover}`}
    >
      <span className={`mx-auto grid size-16 place-items-center rounded-full ${theme.icon}`}>
        <Icon size={28} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className={`mt-4 core-caption font-semibold uppercase ${theme.eyebrow}`}>{method.eyebrow}</span>
      <span className="mx-auto mt-2 block max-w-[18rem] core-heading-2 font-semibold leading-tight text-[var(--core-text)]">{method.title}</span>
      <span className="mx-auto mt-4 block h-px w-full max-w-[18rem] bg-[var(--core-border)]" aria-hidden="true" />
      <span className="mx-auto mt-3 block max-w-[19rem] text-left core-body leading-6 text-[var(--core-text-muted)]">{method.body}</span>
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
