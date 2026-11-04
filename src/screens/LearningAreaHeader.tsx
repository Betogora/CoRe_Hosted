import React from "react";
import { Settings2 } from "lucide-react";
import { ActionButton } from "../ui/actionUi.tsx";
import { PageHeader } from "../ui/coreUi.tsx";

const learnAreaHeadings = {
  overview: { eyebrow: "Review", title: "Lernen" },
  cards: { eyebrow: "Alle Stapel", title: "Kartenverwaltung" },
};

export function LearningAreaHeader({ area, onOpenCardSettings }: {
  area: keyof typeof learnAreaHeadings;
  onOpenCardSettings: () => unknown;
}) {
  const heading = learnAreaHeadings[area];
  return (
    <div className="[&>header]:flex-wrap">
      <PageHeader eyebrow={heading.eyebrow} title={heading.title} action={
        <ActionButton type="button" variant="secondary" icon={Settings2} onClick={onOpenCardSettings}>
          Lerneinstellungen
        </ActionButton>
      } />
    </div>
  );
}
