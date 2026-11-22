import React from "react";
import { Settings2 } from "lucide-react";
import { ActionButton } from "../ui/actionUi.tsx";
import { PageHeader } from "../ui/coreUi.tsx";

const learnAreaTitles = {
  overview: "Lernen",
  cards: "Kartenverwaltung",
};

export function LearningAreaHeader({ area, onOpenCardSettings, action, viewControl }: {
  area: keyof typeof learnAreaTitles;
  onOpenCardSettings: () => unknown;
  action?: React.ReactNode;
  /** Sits before the settings action, which then shrinks to its icon on phones so the header stays one line. */
  viewControl?: React.ReactNode;
}) {
  return (
    <div className="[&>header]:flex-wrap">
      <PageHeader title={learnAreaTitles[area]} action={
        <div className="flex flex-wrap items-center gap-2">
          {action}
          {viewControl}
          <ActionButton type="button" variant="secondary" icon={Settings2} className={viewControl ? "max-sm:min-w-button max-sm:gap-0 max-sm:px-0 max-sm:[&>span]:sr-only" : ""} onClick={onOpenCardSettings}>
            Lerneinstellungen
          </ActionButton>
        </div>
      } />
    </div>
  );
}
