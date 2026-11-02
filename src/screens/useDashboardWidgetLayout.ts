import React from "react";

/** Board-relative layout positions; unlike client rects they ignore scrolling, content above the board and running FLIP transforms. */
function boardPositions(board: HTMLElement) {
  const positions = new Map<string, { x: number; y: number }>();
  for (const widget of board.querySelectorAll<HTMLElement>("[data-dashboard-widget]")) {
    const own = widget.offsetParent === board;
    positions.set(widget.dataset.dashboardWidget!, { x: widget.offsetLeft - (own ? 0 : board.offsetLeft), y: widget.offsetTop - (own ? 0 : board.offsetTop) });
  }
  return positions;
}

/** Pack natural widget heights into a fine grid instead of stretching whole rows. */
export function useDashboardWidgetLayout(grid: React.RefObject<HTMLDivElement | null>, order: string, editing: boolean) {
  const previous = React.useRef(new Map<string, { x: number; y: number }>());

  React.useLayoutEffect(() => {
    const board = grid.current;
    if (!board) return;
    const widgets = [...board.querySelectorAll<HTMLElement>("[data-dashboard-widget]")];
    function measure() {
      if (!board) return;
      const columns = getComputedStyle(board).gridTemplateColumns.split(/\s+/).length;
      const remaining = [...widgets].sort((a, b) => Number(a.dataset.layoutOrder) - Number(b.dataset.layoutOrder));
      const spans = new Map(widgets.map((widget) => [widget, Math.min(columns, Number(getComputedStyle(widget).gridColumnStart.replace("span ", "")) || columns)]));
      let free = columns, position = 0;
      // Fill a partial row before placing a wide tile that would seal the gap below it.
      while (remaining.length) {
        const index = remaining.findIndex((widget) => spans.get(widget)! <= free);
        if (index < 0) { free = columns; continue; }
        const [widget] = remaining.splice(index, 1);
        free -= spans.get(widget)!;
        widget.style.order = String(position++);
        if (free === 0) free = columns;
      }
      for (const widget of widgets) {
        const body = widget.querySelector<HTMLElement>(".dashboard-widget-body");
        if (body) widget.style.gridRowEnd = `span ${Math.ceil((body.getBoundingClientRect().height + 28) / 8)}`;
      }
    }
    measure();
    // Height changes reflow the board without an order change; keep the FLIP baseline current.
    const observer = new ResizeObserver(() => { measure(); previous.current = boardPositions(board); });
    for (const widget of widgets) {
      const body = widget.querySelector<HTMLElement>(".dashboard-widget-body");
      if (body) observer.observe(body);
    }
    return () => observer.disconnect();
  }, [grid, order, editing]);

  React.useLayoutEffect(() => {
    const board = grid.current;
    if (!board) return;
    const next = boardPositions(board);
    for (const widget of board.querySelectorAll<HTMLElement>("[data-dashboard-widget]")) {
      const id = widget.dataset.dashboardWidget!;
      widget.getAnimations().forEach((animation) => animation.cancel());
      const before = previous.current.get(id), after = next.get(id)!;
      if (before && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && (before.x !== after.x || before.y !== after.y)) {
        widget.animate([{ transform: `translate(${before.x - after.x}px, ${before.y - after.y}px)` }, { transform: "translate(0, 0)" }], { duration: 180, easing: "ease-out" });
      }
    }
    previous.current = next;
  }, [grid, order]);
}
