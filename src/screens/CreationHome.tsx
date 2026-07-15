import type { LucideIcon } from "lucide-react";
import { FileSpreadsheet, PenLine, WandSparkles } from "lucide-react";
import type { CreationMethod } from "../useAppNavigation.ts";

type SelectableCreationMethod = Exclude<CreationMethod, "">;

export interface CreationMethodDefinition {
  id: SelectableCreationMethod;
  title: string;
  eyebrow: string;
  body: string;
  icon: LucideIcon;
  color: "sky" | "teal" | "indigo";
}

export interface CreationHomeProps {
  showAiDrafts: boolean;
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
  {
    id: "ai",
    title: "Lokaler Entwurfsassistent",
    eyebrow: "Labs · Entwürfe prüfen",
    body: "Erzeuge lokal und deterministisch Entwürfe aus Quellentext. Es wird kein externes Modell aufgerufen.",
    icon: WandSparkles,
    color: "indigo",
  },
];

const methodThemes: Record<CreationMethodDefinition["color"], { eyebrow: string; icon: string; hover: string }> = {
  sky: {
    eyebrow: "text-sky-700",
    icon: "bg-sky-50 text-sky-700 shadow-[inset_0_-18px_42px_rgba(14,165,233,0.08)]",
    hover: "hover:border-sky-200 hover:shadow-[0_18px_42px_rgba(14,116,144,0.12)]",
  },
  teal: {
    eyebrow: "text-teal-700",
    icon: "bg-teal-50 text-teal-700 shadow-[inset_0_-18px_42px_rgba(20,184,166,0.09)]",
    hover: "hover:border-teal-200 hover:shadow-[0_18px_42px_rgba(13,148,136,0.12)]",
  },
  indigo: {
    eyebrow: "text-indigo-700",
    icon: "bg-indigo-50 text-indigo-700 shadow-[inset_0_-18px_42px_rgba(79,70,229,0.08)]",
    hover: "hover:border-indigo-200 hover:shadow-[0_18px_42px_rgba(79,70,229,0.12)]",
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
      className={`group grid min-h-60 content-start rounded-[18px] border border-[#dde3f4] bg-white/82 px-5 py-6 text-center shadow-[0_8px_22px_rgba(91,105,154,0.08)] transition duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8790d8] ${theme.hover}`}
    >
      <span className={`mx-auto grid size-16 place-items-center rounded-full ${theme.icon}`}>
        <Icon size={28} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className={`mt-4 text-xs font-semibold uppercase ${theme.eyebrow}`}>{method.eyebrow}</span>
      <span className="mx-auto mt-2 block max-w-[18rem] text-2xl font-semibold leading-tight text-[#17214f]">{method.title}</span>
      <span className="mx-auto mt-4 block h-px w-full max-w-[18rem] bg-[#dfe4f5]" aria-hidden="true" />
      <span className="mx-auto mt-3 block max-w-[19rem] text-left text-sm leading-6 text-[#66709a]">{method.body}</span>
    </button>
  );
}

export function CreationHome({ showAiDrafts, onSelect }: CreationHomeProps) {
  const availableMethods = showAiDrafts ? creationMethods : creationMethods.filter((method) => method.id !== "ai");

  return (
    <section className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Erstellungsart">
      {availableMethods.map((method) => (
        <CreationMethodButton key={method.id} method={method} onSelect={() => onSelect(method.id)} />
      ))}
    </section>
  );
}
