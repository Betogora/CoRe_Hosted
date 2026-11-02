import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { IconButton } from "../ui/actionUi.tsx";

/** Only dashboard previews collapse text; labels retain their complete accessible name. */
export function DashboardTaskText({ children, checkbox }: { children: React.ReactNode; checkbox: React.ReactNode }) {
  const [expanded, setExpanded] = React.useState(false);
  const [overflow, setOverflow] = React.useState(false);
  const content = React.useRef<HTMLSpanElement>(null);
  const id = React.useId();
  React.useLayoutEffect(() => {
    const element = content.current;
    if (!element || expanded) return;
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, expanded]);
  return <div className="flex min-w-0 flex-1 items-start gap-1">
    <label className="flex min-h-control min-w-0 flex-1 cursor-pointer items-center gap-3">{checkbox}<span ref={content} id={id} className={`min-w-0 flex-1 break-words ${expanded ? "" : "line-clamp-2"}`}>{children}</span></label>
    {overflow || expanded ? <IconButton icon={expanded ? ChevronUp : ChevronDown} variant="ghost" label={expanded ? "Aufgabentext einklappen" : "Vollständigen Aufgabentext anzeigen"} aria-controls={id} aria-expanded={expanded} onClick={() => setExpanded(!expanded)} /> : null}
  </div>;
}
