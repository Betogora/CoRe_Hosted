import React from "react";
import type { DashboardWidgetId } from "../dashboardWidgets.ts";

interface Gesture {
  id: DashboardWidgetId;
  adding: boolean;
  overBoard: boolean;
  handle: HTMLButtonElement;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  moved: boolean;
  target: DashboardWidgetId | null;
  scroller: HTMLElement | null;
  slots: { id: DashboardWidgetId; left: number; top: number; right: number; bottom: number }[];
}

interface DragPreview {
  id: DashboardWidgetId;
  adding: boolean;
  overBoard: boolean;
  x: number;
  y: number;
  width: number;
  target: DashboardWidgetId | null;
}

function findScrollParent(element: HTMLElement) {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return null;
}

/** The gesture stays transient; only releasing over this board commits the order. */
export function useDashboardWidgetDrag(onDrop: (from: DashboardWidgetId, to: DashboardWidgetId | null, adding: boolean) => void) {
  const grid = React.useRef<HTMLDivElement>(null);
  const ghost = React.useRef<HTMLDivElement>(null);
  const gesture = React.useRef<Gesture | null>(null);
  const frame = React.useRef<number | null>(null);
  const suppressClick = React.useRef(false);
  const [preview, setPreview] = React.useState<DragPreview | null>(null);

  function clear() {
    const current = gesture.current;
    gesture.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (current?.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    return current;
  }

  React.useEffect(() => () => { clear(); }, []);

  function cancel() {
    const current = clear();
    if (current?.moved) suppressClick.current = true;
    setPreview(null);
    if (current?.handle.isConnected) current.handle.focus({ preventScroll: true });
  }

  function update() {
    const current = gesture.current;
    const board = grid.current;
    if (!current || !board || !current.moved) return;
    const bounds = board.getBoundingClientRect();
    const view = current.scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const inside = current.x >= bounds.left && current.x <= bounds.right && current.y >= view.top && current.y <= view.bottom;
    if (inside) {
      const top = Math.max(0, view.top), bottom = Math.min(window.innerHeight, view.bottom);
      const scroll = current.y < top + 64 ? -12 : current.y > bottom - 64 ? 12 : 0;
      if (scroll) (current.scroller ?? window).scrollBy({ top: scroll, behavior: "instant" });
    }
    const hit = document.elementFromPoint(current.x, current.y);
    current.overBoard = Boolean(hit && board.contains(hit));
    let target: DashboardWidgetId | null = null;
    // Freeze slots for this gesture so live repacking cannot oscillate under a stationary pointer.
    if (hit && board.contains(hit)) {
      let closest = Infinity;
      const x = current.x - bounds.left, y = current.y - bounds.top;
      for (const slot of current.slots) {
        const distance = Math.hypot(Math.max(slot.left - x, 0, x - slot.right), Math.max(slot.top - y, 0, y - slot.bottom));
        if (distance < closest) { closest = distance; target = slot.id; }
      }
    }
    current.target = target;
    const width = Math.min(current.width, window.innerWidth - 16);
    const height = ghost.current?.offsetHeight ?? 80;
    const next = { id: current.id, adding: current.adding, overBoard: current.overBoard, x: Math.max(8, Math.min(current.x - current.offsetX, window.innerWidth - width - 8)), y: Math.max(8, Math.min(current.y - current.offsetY, window.innerHeight - height - 8)), width, target: current.target };
    setPreview((previous) => previous && previous.x === next.x && previous.y === next.y && previous.width === next.width && previous.target === next.target && previous.overBoard === next.overBoard ? previous : next);
  }

  function animate() {
    update();
    frame.current = requestAnimationFrame(animate);
  }

  function start(event: React.PointerEvent<HTMLButtonElement>, id: DashboardWidgetId, adding = false) {
    if (event.button !== 0 || gesture.current) return;
    const widget = adding ? event.currentTarget : event.currentTarget.closest<HTMLElement>("[data-dashboard-widget]");
    if (!widget) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    suppressClick.current = false;
    const rect = widget.getBoundingClientRect();
    const bounds = grid.current!.getBoundingClientRect();
    const slots = [...grid.current!.querySelectorAll<HTMLElement>("[data-dashboard-widget]")].map((entry) => {
      const slot = entry.getBoundingClientRect();
      return { id: entry.dataset.dashboardWidget as DashboardWidgetId, left: slot.left - bounds.left, top: slot.top - bounds.top, right: slot.right - bounds.left, bottom: slot.bottom - bounds.top };
    });
    gesture.current = { id, adding, overBoard: false, handle: event.currentTarget, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, moved: false, target: null, scroller: findScrollParent(widget), slots };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.x = event.clientX; current.y = event.clientY;
    if (!current.moved && Math.hypot(current.x - current.startX, current.y - current.startY) >= 7) {
      current.moved = true;
      animate();
    }
  }

  function finish(event: React.PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.x = event.clientX; current.y = event.clientY;
    update();
    const target = current.target;
    suppressClick.current = current.moved;
    cancel();
    if (current.moved && current.overBoard && (current.adding || (target && current.id !== target))) onDrop(current.id, target, current.adding);
  }

  function keyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !gesture.current) return;
    event.preventDefault(); event.stopPropagation(); cancel();
  }

  function consumeClick() {
    const suppressed = suppressClick.current;
    suppressClick.current = false;
    return suppressed;
  }
  return { grid, ghost, preview, start, move, finish, cancel, keyDown, consumeClick };
}
