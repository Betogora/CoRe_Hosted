import type { CSSProperties, ReactNode } from "react";

export interface MetricRowItem {
  label: string;
  value: ReactNode;
  dot?: string;
}

export function MetricRow({ items, className = "", ...props }: { items: ReadonlyArray<MetricRowItem>; className?: string; "aria-label"?: string; "data-testid"?: string }) {
  const style = { "--core-metric-columns": items.length, "--core-metric-columns-medium": Math.min(items.length, 4) } as CSSProperties;
  return (
    <div className={`core-metric-row ${className}`.trim()}>
      <dl {...props} style={style}>
        {items.map((item) => {
          const zero = item.value === 0 || item.value === "0";
          return (
            <div key={item.label} className="core-metric-row-item">
              <dt className="core-metric-row-label">
                {item.dot ? <span aria-hidden="true" className="core-metric-row-dot" style={{ background: item.dot }} /> : null}
                {item.label}
              </dt>
              <dd className={`core-metric ${zero ? "text-core-muted" : "text-core-text"}`} data-zero={zero || undefined}>{item.value}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
