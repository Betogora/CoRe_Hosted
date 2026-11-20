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

export function useDashboardWidgetLayout(grid: React.RefObject<HTMLDivElement | null>, order: string) {
  const previous = React.useRef(new Map<string, { x: number; y: number }>());

  // Entering edit mode or a narrower window moves widgets without an order change; keep the FLIP baseline current.
  React.useLayoutEffect(() => {
    const board = grid.current;
    if (!board) return;
    const observer = new ResizeObserver(() => { previous.current = boardPositions(board); });
    observer.observe(board);
    return () => observer.disconnect();
  }, [grid]);

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
