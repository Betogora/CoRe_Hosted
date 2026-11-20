import React from "react";
import { SectionHeader } from "../../ui/SectionHeader.tsx";

export function CardEditorSection({ title, aside, testId, children }: {
  title: string;
  aside?: React.ReactNode;
  testId?: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} data-testid={testId} className="core-card-editor-section">
      <SectionHeader id={id} level={3} title={title} action={aside} />
      {children}
    </section>
  );
}
