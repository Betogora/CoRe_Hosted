import type { ReactNode } from "react";

export interface SectionHeaderProps {
  title: ReactNode;
  /** Heading level chosen by the caller from the page outline. */
  level: 2 | 3 | 4;
  /** Optional muted count after the title, for example the number of entries. */
  count?: ReactNode;
  /** Right-aligned slot for the actions of this surface. */
  action?: ReactNode;
  /** Id of the heading, for `aria-labelledby` of the surface. */
  id?: string;
  className?: string;
}

/**
 * The one head of a surface: title left, optional count, actions right, without an icon. A fixed minimum height
 * keeps the heads of neighbouring surfaces on one baseline; spacing around it belongs to the surface.
 */
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
