import React from "react";
import { Settings2 } from "lucide-react";
import { ActionButton } from "../ui/actionUi.tsx";
import { PageHeader } from "../ui/coreUi.tsx";

const learnAreaHeadings = {
  overview: { eyebrow: "Review", title: "Lernen" },
  cards: { eyebrow: "Alle Stapel", title: "Kartenverwaltung" },
};

export function LearningAreaHeader({ area, onOpenCardSettings, action }: {
  area: keyof typeof learnAreaHeadings;
  onOpenCardSettings: () => unknown;
  /** A further action of the area before `Lerneinstellungen`. */
  action?: React.ReactNode;
}) {
  const heading = learnAreaHeadings[area];
  return (
    <div className="[&>header]:flex-wrap">
      <PageHeader eyebrow={heading.eyebrow} title={heading.title} action={
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
