import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ActionButton } from "../ui/actionUi.tsx";
import { formatExamDate } from "./examPlanningUi.ts";

interface Topic { id: string; name: string; detail: string }

export function ExamTopicPreview({ topics, examDate, color, calendarRef, actionsRef }: {
  topics: Topic[]; examDate: string; color?: string; calendarRef: React.RefObject<HTMLDivElement | null>; actionsRef: React.RefObject<HTMLDivElement | null>;
}) {
  const panel = React.useRef<HTMLElement>(null), heading = React.useRef<HTMLHeadingElement>(null);
  const list = React.useRef<HTMLOListElement>(null), footer = React.useRef<HTMLDivElement>(null), toggle = React.useRef<HTMLDivElement>(null);
  const topicsId = React.useId();
  const viewport = React.useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [fit, setFit] = React.useState({ count: Math.min(3, topics.length), height: 200, available: 200, overflow: topics.length > 3 });
  React.useLayoutEffect(() => {
    const measure = () => {
      if (!panel.current || !list.current || !calendarRef.current || !heading.current || !footer.current) return;
      const style = getComputedStyle(panel.current), gap = parseFloat(style.rowGap) || 0;
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const viewportRoom = (actionsRef.current?.getBoundingClientRect().top ?? window.innerHeight) - panel.current.getBoundingClientRect().top - gap;
      const budget = Math.min(calendarRef.current.getBoundingClientRect().height, window.innerWidth >= 1280 ? Math.max(220, viewportRoom) : 320);
      const available = Math.max(0, budget - padding - heading.current.offsetHeight - footer.current.offsetHeight - gap * 2);
      const items = Array.from(list.current.children) as HTMLElement[];
      const ends = items.map((item) => item.offsetTop - (items[0]?.offsetTop ?? 0) + item.offsetHeight);
      const overflow = (ends.at(-1) ?? 0) > available;
      const room = overflow ? Math.max(0, available - (toggle.current?.offsetHeight || parseFloat(style.getPropertyValue("--core-control-height"))) - gap) : available;
      const count = ends.filter((end) => end <= room).length;
      const next = { count, height: ends[count - 1] ?? 0, available: room, overflow };
      setFit((previous) => previous.count === next.count && previous.height === next.height && previous.available === next.available && previous.overflow === next.overflow ? previous : next);
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    for (const element of [calendarRef.current, panel.current, list.current, toggle.current]) if (element) observer.observe(element);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [calendarRef, actionsRef, topics, fit.overflow]);

  return <aside ref={panel} className="grid min-w-0 gap-4 xl:sticky xl:top-24 rounded-panel border border-core-border bg-core-surface p-4" aria-label="Themenvorschau" data-testid="exam-topic-preview">
    <h3 ref={heading} className="core-heading-3 font-semibold text-core-text">Deine Themenfolge</h3>
    <div ref={viewport} id={topicsId} className={expanded && fit.overflow ? "min-w-0 overflow-y-auto" : "min-w-0 overflow-hidden"} style={fit.overflow ? { height: expanded ? fit.available : fit.height } : undefined} role={expanded && fit.overflow ? "region" : undefined} aria-label={expanded && fit.overflow ? "Alle Themen" : undefined} tabIndex={expanded && fit.overflow ? 0 : undefined}>
      <ol ref={list} className="relative grid gap-4" aria-label="Geplante Themenfolge">{topics.map((topic, index) => {
        const hidden = fit.overflow && !expanded && index >= fit.count;
        return <li key={topic.id} aria-hidden={hidden || undefined} className="grid min-w-0 gap-1 border-l border-core-border pl-3" style={hidden ? { visibility: "hidden" } : undefined}><span className="break-words core-body text-core-text">{topic.name}</span><span className="core-caption text-core-muted">{topic.detail}</span></li>;
      })}</ol>
    </div>
    {fit.overflow ? <div ref={toggle}><ActionButton variant="secondary" icon={expanded ? ChevronUp : ChevronDown} className="w-full" aria-expanded={expanded} aria-controls={topicsId} onClick={() => { if (viewport.current) viewport.current.scrollTop = 0; setExpanded((value) => !value); }}>{expanded ? "Weniger anzeigen" : `Alle ${topics.length} Themen anzeigen`}</ActionButton></div> : null}
    <div ref={footer} className="grid gap-1 border-l-strong pl-3" style={{ borderColor: color }} data-testid="exam-topic-exam-date"><span className="core-body text-core-text">Prüfung</span><span className="core-caption text-core-muted">{formatExamDate(examDate, "short")}</span></div>
  </aside>;
}
