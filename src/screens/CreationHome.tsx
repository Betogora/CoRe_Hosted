import { CreationActionCard } from "../ui/CreationActionCard.tsx";
import type { LucideIcon } from "lucide-react";
import { FileSpreadsheet, PenLine, Sparkles } from "lucide-react";
import type { CreationMethod } from "../useAppNavigation.ts";

type SelectableCreationMethod = Exclude<CreationMethod, "">;

export interface CreationMethodDefinition {
  id: SelectableCreationMethod;
  title: string;
  /** Page title while this way is open; it names the way instead of a second panel title. */
  pageTitle: string;
  icon: LucideIcon;
}

export interface CreationHomeProps {
  onSelect: (method: SelectableCreationMethod) => unknown;
}

export const creationMethods: CreationMethodDefinition[] = [
  {
    id: "manual",
    title: "Karten selbst erstellen",
    pageTitle: "Karte selbst erstellen",
    icon: PenLine,
  },
  {
    id: "import",
    title: "Import",
    pageTitle: "Anki-Dateien importieren",
    icon: FileSpreadsheet,
  },
  {
    id: "ai-source",
    title: "Karten automatisch erstellen lassen",
    pageTitle: "Karten automatisch erstellen lassen",
    icon: Sparkles,
  },
];

export function CreationHome({ onSelect }: CreationHomeProps) {
  return (
    <section className="grid items-stretch gap-4 md:grid-cols-3" aria-label="Erstellungsart">
      {creationMethods.map((method) => (
        <CreationActionCard key={method.id} title={method.title} icon={method.icon} onSelect={() => onSelect(method.id)} />
      ))}
    </section>
  );
}
