const DOWNSCALABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FULL_HD_LANDSCAPE = { width: 1_920, height: 1_080 } as const;

function fullHdImageSize(width: number, height: number) {
  const bounds = width >= height ? FULL_HD_LANDSCAPE : { width: FULL_HD_LANDSCAPE.height, height: FULL_HD_LANDSCAPE.width };
  const scale = Math.min(1, bounds.width / width, bounds.height / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Shrinks JPEG, PNG and WebP images to Full HD in their own format; other types and small images stay unchanged. */
export async function downscaleImageToFullHd(file: Blob): Promise<Blob> {
  if (!DOWNSCALABLE_IMAGE_TYPES.has(file.type) || typeof globalThis.createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await globalThis.createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Das Bild konnte nicht gelesen werden.");
  }
  const size = fullHdImageSize(bitmap.width, bitmap.height);
  if (size.width === bitmap.width && size.height === bitmap.height) {
    bitmap.close();
    return file;
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
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Das Bild konnte nicht verkleinert werden.")), file.type, 0.9);
  });
}
