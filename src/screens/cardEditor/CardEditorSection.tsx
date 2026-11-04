import React from "react";
import { SoftPanel } from "../../ui/coreUi.tsx";

/**
 * A titled panel of the card editor tabs: settings typography (16-px title, 24-px padding) and an optional
 * right-aligned status or action next to the title.
 */
export function CardEditorSection({ title, aside, testId, children }: {
  title: string;
  aside?: React.ReactNode;
  testId?: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <SoftPanel aria-labelledby={id} data-testid={testId} className="grid grid-cols-[minmax(0,1fr)] content-start gap-4 p-4 sm:p-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 id={id} className="core-heading-3 font-semibold text-core-text">{title}</h3>
        {aside}
      </div>
      {children}
    </SoftPanel>
  );
}
