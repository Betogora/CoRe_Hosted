import { Settings2 } from "lucide-react";
import { ActionButton } from "../ui/actionUi.tsx";
import { PageHeader } from "../ui/coreUi.tsx";

const learnAreaTitles = {
  overview: "Lernen",
  cards: "Kartenverwaltung",
};

export function LearningAreaHeader({ area, onOpenCardSettings }: {
  area: keyof typeof learnAreaTitles;
  onOpenCardSettings: () => unknown;
}) {
  return (
    <div className="[&>header]:flex-wrap">
      <PageHeader title={learnAreaTitles[area]} action={
        <ActionButton type="button" variant="secondary" icon={Settings2} onClick={onOpenCardSettings}>
          Lerneinstellungen
        </ActionButton>
      } />
    </div>
  );
}
