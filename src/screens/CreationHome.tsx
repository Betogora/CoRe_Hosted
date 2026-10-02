import { CreationActionCard, type CreationActionCardProps } from "../ui/CreationActionCard.tsx";
import type { LucideIcon } from "lucide-react";
import { FileSpreadsheet, PenLine } from "lucide-react";
import type { CreationMethod } from "../useAppNavigation.ts";

type SelectableCreationMethod = Exclude<CreationMethod, "">;

export interface CreationMethodDefinition {
  id: SelectableCreationMethod;
  title: string;
  icon: LucideIcon;
  tone: CreationActionCardProps["tone"];
}

export interface CreationHomeProps {
  onSelect: (method: SelectableCreationMethod) => unknown;
}

export const creationMethods: CreationMethodDefinition[] = [
  {
    id: "manual",
    title: "Karten selbst erstellen",
    icon: PenLine,
    tone: "info",
  },
  {
    id: "import",
    title: "Import",
    icon: FileSpreadsheet,
    tone: "success",
  },
];

export function CreationHome({ onSelect }: CreationHomeProps) {
  return (
    <section className="grid items-stretch gap-4 md:grid-cols-2" aria-label="Erstellungsart">
      {creationMethods.map((method) => (
        <CreationActionCard key={method.id} title={method.title} icon={method.icon} tone={method.tone} onSelect={() => onSelect(method.id)} />
      ))}
    </section>
  );
}
