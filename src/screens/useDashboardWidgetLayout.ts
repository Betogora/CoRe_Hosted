import React from "react";

/** Pack natural widget heights into a fine grid instead of stretching whole rows. */
export function useDashboardWidgetLayout(grid: React.RefObject<HTMLDivElement | null>, order: string, editing: boolean) {
  const previous = React.useRef(new Map<string, DOMRect>());

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
    const observer = new ResizeObserver(measure);
    for (const widget of widgets) {
      const body = widget.querySelector<HTMLElement>(".dashboard-widget-body");
      if (body) observer.observe(body);
    }
    return () => observer.disconnect();
  }, [grid, order, editing]);

  React.useLayoutEffect(() => {
    const widgets = grid.current?.querySelectorAll<HTMLElement>("[data-dashboard-widget]");
    if (!widgets) return;
    const next = new Map<string, DOMRect>();
    for (const widget of widgets) {
      const id = widget.dataset.dashboardWidget!;
      widget.getAnimations().forEach((animation) => animation.cancel());
      const rect = widget.getBoundingClientRect();
      const before = previous.current.get(id);
      next.set(id, rect);
      if (before && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && (before.x !== rect.x || before.y !== rect.y)) {
        widget.animate([{ transform: `translate(${before.x - rect.x}px, ${before.y - rect.y}px)` }, { transform: "translate(0, 0)" }], { duration: 180, easing: "ease-out" });
      }
    }
    previous.current = next;
  }, [grid, order]);
}
