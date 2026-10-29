import React from "react";

/** Pack natural widget heights into a fine grid instead of stretching whole rows. */
export function useDashboardWidgetLayout(grid: React.RefObject<HTMLDivElement | null>, order: string, editing: boolean) {
  const previous = React.useRef(new Map<string, DOMRect>());

  React.useLayoutEffect(() => {
    const board = grid.current;
    if (!board) return;
    const widgets = [...board.querySelectorAll<HTMLElement>("[data-dashboard-widget]")];
    function measure() {
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
