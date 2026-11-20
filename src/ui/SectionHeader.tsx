import type { ReactNode } from "react";

export interface SectionHeaderProps {
  title: ReactNode;
  level: 2 | 3 | 4;
  count?: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
}

export function SectionHeader({ title, level, count, action, id, className = "" }: SectionHeaderProps) {
  const Heading = `h${level}` as const;
  return (
    <div className={`core-section-header ${className}`.trim()}>
      <Heading id={id} className="core-section-header-title">{title}</Heading>
      {count == null ? null : <span className="core-section-header-count">{count}</span>}
      {action ? <div className="core-section-header-action">{action}</div> : null}
    </div>
  );
}
