import React from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ChevronDown, GripVertical } from "lucide-react";
import { IconButton } from "../ui/actionUi.tsx";

interface Topic { id: string; name: string }
interface Drag {
  id: string; order: string[]; startX: number; startY: number; x: number; y: number;
  offsetX: number; offsetY: number; width: number; moved: boolean; handle: HTMLButtonElement;
  /** The page region that scrolls, e.g. the content region from 1280 px; `null` means the window. */
  scroller: HTMLElement | null;
}
interface Preview { id: string; order: string[]; x: number; y: number; width: number }

function scrollParent(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/** Topic sorting is a local draft; dragging commits only when released inside the list. */
export function ExamTopicOrder({ topics, disabled = false, onChange }: {
  topics: Topic[]; disabled?: boolean; onChange: (ids: string[]) => void;
}) {
  const list = React.useRef<HTMLOListElement>(null);
  const drag = React.useRef<Drag | null>(null);
  const frame = React.useRef<number | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const helpId = React.useId();
  React.useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const order = preview?.order ?? topics.map((topic) => topic.id);
  const names = new Map(topics.map((topic) => [topic.id, topic.name]));

  function focus(handle: HTMLElement) { requestAnimationFrame(() => { if (handle.isConnected) handle.focus(); }); }
  function commit(ids: string[], id: string, handle: HTMLElement) {
    onChange(ids);
    setAnnouncement(`${names.get(id)}: Position ${ids.indexOf(id) + 1} von ${ids.length}.`);
    focus(handle);
  }
  function move(id: string, direction: number, handle: HTMLElement) {
    const next = topics.map((topic) => topic.id), index = next.indexOf(id), target = index + direction;
    if (disabled || target < 0 || target >= next.length) return;
    next.splice(index, 1); next.splice(target, 0, id); commit(next, id, handle);
  }
  function cancel() {
    const gesture = drag.current;
    drag.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null; setPreview(null);
    if (gesture) focus(gesture.handle);
  }
  function updatePreview() {
    const gesture = drag.current, element = list.current;
    if (!gesture || !element) return;
    const bounds = element.getBoundingClientRect();
    if (gesture.x >= bounds.left && gesture.x <= bounds.right) {
      const view = gesture.scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
      const page = gesture.scroller ?? window;
      if (gesture.y < view.top + 48) page.scrollBy({ top: -12, behavior: "instant" });
      else if (gesture.y > view.bottom - 48) page.scrollBy({ top: 12, behavior: "instant" });
      const top = Math.max(view.top, bounds.top), bottom = Math.min(view.bottom, bounds.bottom);
      if (gesture.y >= top && gesture.y <= bottom) element.scrollTop += gesture.y < top + 32 ? -10 : gesture.y > bottom - 32 ? 10 : 0;
      const rows = [...element.querySelectorAll<HTMLElement>("[data-topic-id]")].filter((row) => row.dataset.topicId !== gesture.id);
      const target = rows.findIndex((row) => { const rect = row.getBoundingClientRect(); return gesture.y < rect.top + rect.height / 2; });
      gesture.order = rows.map((row) => row.dataset.topicId!);
      gesture.order.splice(target < 0 ? rows.length : target, 0, gesture.id);
    }
    const next = { id: gesture.id, order: gesture.order, x: gesture.x - gesture.offsetX, y: gesture.y - gesture.offsetY, width: gesture.width };
    setPreview((previous) => previous && previous.x === next.x && previous.y === next.y && previous.order.every((id, i) => id === next.order[i]) ? previous : next);
  }
  function animate() { updatePreview(); frame.current = requestAnimationFrame(animate); }
  function finish(event: React.PointerEvent<HTMLOListElement>) {
    const gesture = drag.current, element = list.current;
    if (!gesture || !element) return;
    gesture.x = event.clientX; gesture.y = event.clientY;
    if (gesture.moved) updatePreview();
    const bounds = element.getBoundingClientRect();
    cancel();
    if (gesture.moved && !disabled && gesture.x >= bounds.left && gesture.x <= bounds.right && gesture.y >= bounds.top && gesture.y <= bounds.bottom) commit(gesture.order, gesture.id, gesture.handle);
  }

  if (!topics.length) return null;
  return <details className="exam-topic-order min-w-0 rounded-control border border-core-border bg-core-surface shadow-soft" onToggle={(event) => { if (!event.currentTarget.open) cancel(); }}>
    <summary data-exam-topic-order-toggle className="flex min-h-control cursor-pointer list-none items-center gap-3 rounded-control px-4 py-2 core-control-label font-semibold text-core-text [&::-webkit-details-marker]:hidden">
      <ChevronDown size={16} aria-hidden="true" className="order-last shrink-0 text-core-muted transition-transform motion-reduce:transition-none" />
      <span className="min-w-0 break-words">Themenreihenfolge ändern</span><span className="ml-auto inline-flex min-h-5 shrink-0 items-center rounded-round border border-core-border px-2 core-caption font-semibold tabular-nums text-core-secondary">{topics.length}</span>
    </summary>
    <p id={helpId} className="sr-only">Am Griff ziehen, um Themen zu verschieben. Alternativ die Pfeilschaltflächen oder am Griff die Pfeiltasten verwenden. Escape bricht das Ziehen ab.</p>
    <ol ref={list} aria-label="Themenreihenfolge" className="grid max-h-[28rem] gap-2 overflow-y-auto border-t border-core-border p-3"
      onPointerMove={(event) => { const gesture = drag.current; if (!gesture) return; gesture.x = event.clientX; gesture.y = event.clientY; if (!gesture.moved && Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) > 6) { gesture.moved = true; animate(); } }}
      onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onKeyDownCapture={(event) => { if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
      {order.map((id, index) => <li key={id} data-topic-id={id} className={`flex min-w-0 items-center gap-2 rounded-control border border-core-border bg-core-surface p-1.5 ${preview?.id === id ? "opacity-40" : ""}`}>
        <IconButton icon={GripVertical} variant="ghost" label={`${names.get(id)} verschieben`} aria-describedby={helpId} disabled={disabled || topics.length < 2} className="shrink-0 touch-none select-none cursor-grab active:cursor-grabbing"
          onPointerDown={(event) => { if (event.button !== 0 || disabled || !list.current) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); const rect = event.currentTarget.closest("li")!.getBoundingClientRect(); drag.current = { id, order: [...order], startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, moved: false, handle: event.currentTarget, scroller: scrollParent(list.current) }; list.current.setPointerCapture(event.pointerId); }}
          onKeyDown={(event) => { if (!drag.current && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); move(id, event.key === "ArrowUp" ? -1 : 1, event.currentTarget); } }} />
        <span className="min-w-0 flex-1 break-words core-body text-core-text">{names.get(id)}</span>
        <div className="flex shrink-0 gap-1">{[-1, 1].map((direction) => <IconButton key={direction} variant="ghost" icon={direction < 0 ? ArrowUp : ArrowDown} label={`${names.get(id)} ${direction < 0 ? "nach oben" : "nach unten"}`} disabled={disabled || index + direction < 0 || index + direction >= order.length} onClick={(event) => move(id, direction, event.currentTarget)} />)}</div>
      </li>)}
    </ol>
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    {preview ? createPortal(<div aria-hidden="true" className="pointer-events-none fixed z-[75] flex min-h-control items-center gap-3 rounded-control border border-core-action bg-core-surface p-3 core-body text-core-text shadow-floating" style={{ left: preview.x, top: preview.y, width: preview.width }}><GripVertical size={16} className="shrink-0 text-core-muted" /><span className="min-w-0 break-words">{names.get(preview.id)}</span></div>, document.body) : null}
  </details>;
}
