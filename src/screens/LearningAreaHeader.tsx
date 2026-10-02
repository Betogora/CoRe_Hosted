import React from "react";
import { Settings2 } from "lucide-react";
import { ActionButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl, PageHeader } from "../ui/coreUi.tsx";
import { learnAreaOptions, type LearnArea } from "./screenConstants.ts";

export function LearningAreaHeader({ area, onAreaChange, onOpenCardSettings }: {
  area: LearnArea;
  onAreaChange: (area: LearnArea) => void;
  onOpenCardSettings: () => unknown;
}) {
  return (
    <div className="core-learning-header-container">
      <PageHeader eyebrow="Review" title="Lernen" action={
        <div className="core-learning-header-actions flex items-center justify-end gap-2">
          <ActionButton type="button" variant="secondary" icon={Settings2} onClick={onOpenCardSettings}>
            Lerneinstellungen
          </ActionButton>
          <CoreSegmentedControl<LearnArea>
            ariaLabel="Bereich in Lernen"
            options={learnAreaOptions}
            value={area}
            typography="control"
            onValueChange={onAreaChange}
            className="core-learning-area-control"
          />
        </div>
      } />
    </div>
  );
}
