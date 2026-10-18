import type { SummaryPage, SummaryPageFormat, SummaryStroke } from "./learningSummaries.ts";

export function summaryPageSize(format: SummaryPageFormat) {
  return format === "landscape" ? { width: 1123, height: 794 } : { width: 794, height: 1123 };
}

export function summaryDrawingBounds(page: SummaryPage) {
  let left = 0; let top = 0; let right = 794; let bottom = 1123;
  for (const stroke of page.strokes) for (const [x, y] of stroke.points) {
    const margin = stroke.width / 2;
    left = Math.min(left, x - margin); top = Math.min(top, y - margin);
    right = Math.max(right, x + margin); bottom = Math.max(bottom, y + margin);
  }
  return { left, top, width: right - left, height: bottom - top };
}

export function summaryStrokePlacement(stroke: SummaryStroke, page: SummaryPage, format: SummaryPageFormat) {
  if (format === "infinity") return { x: 0, y: 0, scale: 1 };
  const target = summaryPageSize(format);
  const bounds = stroke.space === "infinity" ? summaryDrawingBounds(page)
    : { left: 0, top: 0, ...summaryPageSize(stroke.space ?? "portrait") };
  const scale = Math.min(target.width / bounds.width, target.height / bounds.height);
  return { x: -bounds.left * scale, y: -bounds.top * scale, scale };
}
