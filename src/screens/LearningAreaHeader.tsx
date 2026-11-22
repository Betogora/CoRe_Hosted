import type { ReactNode } from "react";
import { Settings2 } from "lucide-react";
import { ActionButton } from "../ui/actionUi.tsx";
import { PageHeader } from "../ui/coreUi.tsx";

const learnAreaTitles = {
  overview: "Lernen",
  cards: "Kartenverwaltung",
};

export function LearningAreaHeader({ area, onOpenCardSettings, viewControl }: {
  area: keyof typeof learnAreaTitles;
  onOpenCardSettings: () => unknown;
  viewControl?: ReactNode;
}) {
  return (
    <div className="[&>header]:flex-wrap">
      <PageHeader title={learnAreaTitles[area]} action={
        <div className="flex flex-wrap items-center gap-2">
          {viewControl}
          <ActionButton type="button" variant="secondary" icon={Settings2} className={viewControl ? "max-sm:min-w-button max-sm:gap-0 max-sm:px-0 max-sm:[&>span]:sr-only" : ""} onClick={onOpenCardSettings}>
            Lerneinstellungen
          </ActionButton>
        </div>
      } />
    </div>
  );
}
