interface RectLike {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

interface PdfViewportLike {
  convertToPdfPoint(x: number, y: number): [number, number];
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizePdfSelectionText(value: unknown = "") {
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .map((part) => String(part ?? "").replace(/\u00a0/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function rectIntersects(first: RectLike = {}, second: RectLike = {}) {
  return !(
    toFiniteNumber(first.right) <= toFiniteNumber(second.left) ||
    toFiniteNumber(first.left) >= toFiniteNumber(second.right) ||
    toFiniteNumber(first.bottom) <= toFiniteNumber(second.top) ||
    toFiniteNumber(first.top) >= toFiniteNumber(second.bottom)
  );
}

export function firstSelectionRectOnPage(rects: Iterable<RectLike> = [], pageRect: RectLike = {}) {
  return [...rects].find((rect) => rectIntersects(rect, pageRect)) ?? null;
}

export function createPdfSelectionBbox({ selectionRect, pageRect, viewport }: { selectionRect?: RectLike | null; pageRect?: RectLike | null; viewport?: PdfViewportLike | null } = {}) {
  if (!selectionRect || !pageRect || typeof viewport?.convertToPdfPoint !== "function") return null;

  const left = Math.max(toFiniteNumber(selectionRect.left), toFiniteNumber(pageRect.left));
  const top = Math.max(toFiniteNumber(selectionRect.top), toFiniteNumber(pageRect.top));
  const right = Math.min(toFiniteNumber(selectionRect.right), toFiniteNumber(pageRect.right));
  const bottom = Math.min(toFiniteNumber(selectionRect.bottom), toFiniteNumber(pageRect.bottom));
  if (right <= left || bottom <= top) return null;

  const pageLeft = toFiniteNumber(pageRect.left);
  const pageTop = toFiniteNumber(pageRect.top);
  const [firstX, firstY] = viewport.convertToPdfPoint(left - pageLeft, top - pageTop);
  const [secondX, secondY] = viewport.convertToPdfPoint(right - pageLeft, bottom - pageTop);

  return {
    left: Math.min(firstX, secondX),
    top: Math.max(firstY, secondY),
    right: Math.max(firstX, secondX),
    bottom: Math.min(firstY, secondY),
  };
}
