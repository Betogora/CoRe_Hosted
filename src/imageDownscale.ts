const DOWNSCALABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FULL_HD_LANDSCAPE = { width: 1_920, height: 1_080 } as const;
type ImageSize = { width: number; height: number };

function scaledSize(width: number, height: number, scale: number): ImageSize {
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function fullHdImageSize(width: number, height: number): ImageSize | null {
  const bounds = width >= height ? FULL_HD_LANDSCAPE : { width: FULL_HD_LANDSCAPE.height, height: FULL_HD_LANDSCAPE.width };
  const scale = Math.min(1, bounds.width / width, bounds.height / height);
  return scale < 1 ? scaledSize(width, height, scale) : null;
}

/** Draws a JPEG, PNG or WebP image at the size `fit` returns; null when the type, the browser or `fit` keeps the original. */
async function drawImage(file: Blob, fit: (width: number, height: number) => ImageSize | null): Promise<HTMLCanvasElement | null> {
  if (!DOWNSCALABLE_IMAGE_TYPES.has(file.type) || typeof globalThis.createImageBitmap !== "function" || typeof document === "undefined") return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await globalThis.createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Das Bild konnte nicht gelesen werden.");
  }
  const size = fit(bitmap.width, bitmap.height);
  if (!size) {
    bitmap.close();
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Das Bild konnte nicht verkleinert werden.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
  } finally {
    bitmap.close();
  }
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Das Bild konnte nicht verkleinert werden.")), type, quality);
  });
}

/** Shrinks JPEG, PNG and WebP images to Full HD in their own format; other types and small images stay unchanged. */
export async function downscaleImageToFullHd(file: Blob): Promise<Blob> {
  const canvas = await drawImage(file, fullHdImageSize);
  return canvas ? await canvasBlob(canvas, file.type, 0.9) : file;
}

/** Redraws JPEG, PNG and WebP images with at most `maxSide` px as WebP (quality 0.85), in their own type where the browser cannot encode WebP; an unscaled original stays when it is smaller. */
export async function compressImage(file: Blob, maxSide: number): Promise<Blob> {
  let resized = false;
  const canvas = await drawImage(file, (width, height) => {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    resized = scale < 1;
    return scaledSize(width, height, scale);
  });
  if (!canvas) return file;
  const webp = await canvasBlob(canvas, "image/webp", 0.85), blob = webp.type === "image/webp" ? webp : await canvasBlob(canvas, file.type, 0.85);
  return resized || blob.size < file.size ? blob : file;
}
