import type { SummaryPage, SummaryPageFormat, SummaryStroke } from "./learningSummaries.ts";

/** Keeps stored page groups intact while projecting their ink onto one continuous sheet. */
export function summaryDrawingLayout(pages: SummaryPage[], format: SummaryPageFormat = "portrait") {
  const width = 794;
  let offset = 0, bottom = 0;
  const strokes: { pageId: string; stroke: SummaryStroke; x: number; y: number; scale: number }[] = [];
  for (const page of pages) {
    let left = 0, top = 0, right = width, pageBottom = 1123;
    for (const stroke of page.strokes.filter((item) => item.space === "infinity")) for (const [x, y] of stroke.points) {
      left = Math.min(left, x - stroke.width / 2); right = Math.max(right, x + stroke.width / 2);
      top = Math.min(top, y - stroke.width / 2); pageBottom = Math.max(pageBottom, y + stroke.width / 2);
    }
    for (const stroke of page.strokes) {
      const scale = stroke.space === "landscape" ? width / 1123 : stroke.space === "infinity" ? width / (right - left) : 1;
      const x = stroke.space === "infinity" ? -left * scale : 0;
      const y = offset + (stroke.space === "infinity" ? -top * scale : 0);
      strokes.push({ pageId: page.id, stroke, x, y, scale });
      for (const [, pointY] of stroke.points) bottom = Math.max(bottom, y + (pointY + stroke.width / 2) * scale);
    }
    offset += (format === "landscape" ? 794 * width / 1123 : format === "infinity" ? (pageBottom - top) * width / (right - left) : 1123) + 24;
  }
  return { width, bottom, strokes };
}
