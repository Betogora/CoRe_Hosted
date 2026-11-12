import React from "react";
import { Settings2 } from "lucide-react";
import { ActionButton } from "../ui/actionUi.tsx";
import { PageHeader } from "../ui/coreUi.tsx";

const learnAreaTitles = {
  overview: "Lernen",
  cards: "Kartenverwaltung",
};

export function LearningAreaHeader({ area, onOpenCardSettings, action }: {
  area: keyof typeof learnAreaTitles;
  onOpenCardSettings: () => unknown;
  /** A further action of the area before `Lerneinstellungen`. */
  action?: React.ReactNode;
}) {
  return (
    <div className="[&>header]:flex-wrap">
      <PageHeader title={learnAreaTitles[area]} action={
        <div className="flex flex-wrap gap-2">
          {action}
          <ActionButton type="button" variant="secondary" icon={Settings2} onClick={onOpenCardSettings}>
            Lerneinstellungen
          </ActionButton>
        </div>
      } />
    </div>
  );
}
