import React from "react";

/** Offsets of `count` rows: row `index` starts at `offsets[index]`, the list is `offsets[count]` high. */
export function rowOffsets(count: number, heightAt: (index: number) => number): Float64Array {
  const offsets = new Float64Array(count + 1);
  for (let index = 0; index < count; index += 1) offsets[index + 1] = offsets[index] + heightAt(index);
  return offsets;
}

/** First and last row (inclusive) that touch `[top, bottom)`; an empty list gives `end < start`. */
export function visibleRange(offsets: Float64Array, top: number, bottom: number): { start: number; end: number } {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: -1 };
  // The first row whose end lies below `top`, then the last row whose start lies above `bottom`.
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (offsets[middle + 1] <= top) low = middle + 1;
    else high = middle;
  }
  const start = low;
  high = count - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (offsets[middle] < bottom) low = middle;
    else high = middle - 1;
  }
  return { start, end: Math.max(start, low) };
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return null;
}

/** Initial window before the first layout (and in static rendering): enough rows for one screen. */
const INITIAL_VIEWPORT = { top: 0, height: 900 };

/**
 * Window of a long list in the page or in the scrolling screen region (KV3): only rows near the visible area render,
 * spacers keep the full height. Rendered rows carry `data-virtual-key` and are measured after each render; rows not
 * measured yet count with `estimate`.
 */
export function useVirtualRows({ count, keyAt, estimate, overscan = 800 }: {
  count: number;
  keyAt: (index: number) => string;
  estimate: (index: number) => number;
  overscan?: number;
}) {
  const listRef = React.useRef<HTMLElement | null>(null);
  const sizes = React.useRef(new Map<string, number>());
  const [measureVersion, setMeasureVersion] = React.useState(0);
  const [viewport, setViewport] = React.useState(INITIAL_VIEWPORT);
  const offsets = React.useMemo(
    () => rowOffsets(count, (index) => sizes.current.get(keyAt(index)) ?? estimate(index)),
    // measureVersion stands for the measured sizes, which live in a ref.
    [count, estimate, keyAt, measureVersion],
  );

  React.useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const list = listRef.current;
      if (!list) return;
      const parent = scrollParent(list);
      const area = parent ? parent.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const listTop = list.getBoundingClientRect().top;
      const top = Math.max(0, area.top - listTop);
      const height = Math.max(0, Math.min(area.bottom, window.innerHeight) - Math.max(area.top, 0));
      setViewport((current) => Math.abs(current.top - top) < 1 && Math.abs(current.height - height) < 1 ? current : { top, height });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    // Capturing scroll events of every element covers the page as well as the scrolling screen region.
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Measures the rendered rows; a changed height moves the offsets of all rows below it.
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let changed = false;
    for (const row of list.querySelectorAll<HTMLElement>("[data-virtual-key]")) {
      const key = row.dataset.virtualKey!;
      const height = row.getBoundingClientRect().height;
      if (height > 0 && Math.abs((sizes.current.get(key) ?? -1) - height) > 0.5) {
        sizes.current.set(key, height);
        changed = true;
      }
    }
    if (changed) setMeasureVersion((version) => version + 1);
  });

  const { start, end } = visibleRange(offsets, viewport.top - overscan, viewport.top + viewport.height + overscan);
  const total = offsets[count];
  const scrollToIndex = React.useCallback((index: number) => {
    const list = listRef.current;
    if (!list || index < 0 || index >= count) return;
    const parent = scrollParent(list);
    const rowTop = list.getBoundingClientRect().top + offsets[index];
    const rowBottom = rowTop + (offsets[index + 1] - offsets[index]);
    const area = parent ? parent.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    // A third of the area keeps the row clear of sticky headers above it.
    const margin = (area.bottom - area.top) / 3;
    if (rowTop >= area.top + margin && rowBottom <= area.bottom) return;
    const delta = rowTop - area.top - margin;
    if (parent) parent.scrollBy({ top: delta });
    else window.scrollBy({ top: delta });
  }, [count, offsets]);

  return {
    listRef,
    start,
    end: Math.min(end, count - 1),
    paddingTop: count ? offsets[start] : 0,
    paddingBottom: count ? total - offsets[Math.min(end, count - 1) + 1] : 0,
    scrollToIndex,
  };
}
