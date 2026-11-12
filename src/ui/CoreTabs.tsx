import React, { type ReactNode } from "react";

export interface CoreTab<T extends string> {
  value: T;
  label: string;
}

export interface CoreTabsProps<T extends string> {
  ariaLabel: string;
  tabs: ReadonlyArray<CoreTab<T>>;
  value: T;
  onValueChange: (value: T) => void;
  /** Id of the `CoreTabPanel` these tabs control. */
  panelId: string;
  className?: string;
}

const tabId = (panelId: string, value: string) => `${panelId}-tab-${value}`;

/**
 * Underline tabs: words on one continuous hairline, the active one at 650 with a 2 px action-blue line, no icons.
 * Arrow keys, Home and End move and select; on narrow views the row scrolls sideways and fades at the edge that
 * has more tabs.
 */
export function CoreTabs<T extends string>({ ariaLabel, tabs, value, onValueChange, panelId, className = "" }: CoreTabsProps<T>) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const measure = () => {
      const start = list.scrollLeft > 1;
      const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
      setOverflow((current) => (current.start === start && current.end === end ? current : { start, end }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    list.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", measure);
    };
  }, [tabs]);

  // Brings the selected tab into the row's own scroll area (beyond the edge fade) without scrolling the page.
  React.useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab) return;
    const fade = 48;
    if (tab.offsetLeft - fade < list.scrollLeft) list.scrollLeft = Math.max(0, tab.offsetLeft - fade);
    else if (tab.offsetLeft + tab.offsetWidth + fade > list.scrollLeft + list.clientWidth) list.scrollLeft = tab.offsetLeft + tab.offsetWidth + fade - list.clientWidth;
  }, [value]);

  function select(index: number) {
    const next = tabs[(index + tabs.length) % tabs.length];
    onValueChange(next.value);
    document.getElementById(tabId(panelId, next.value))?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.value === value);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  }

  return (
    <div className={`core-tabs ${className}`.trim()} data-overflow-start={overflow.start || undefined} data-overflow-end={overflow.end || undefined}>
      <div ref={listRef} role="tablist" aria-label={ariaLabel} className="core-tabs-list" onKeyDown={handleKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.value === value;
          return (
            <button
              key={tab.value}
              id={tabId(panelId, tab.value)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className="core-tabs-tab"
              data-label={tab.label}
              onClick={() => onValueChange(tab.value)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The region controlled by `CoreTabs`; pass the same `panelId` and the selected `value`. */
export function CoreTabPanel({ panelId, value, className, children }: { panelId: string; value: string; className?: string; children: ReactNode }) {
  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId(panelId, value)} tabIndex={0} className={className}>
      {children}
    </div>
  );
}
