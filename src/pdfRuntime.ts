let pdfJsPromise: Promise<any>|null = null;

export function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist/build/pdf.mjs").then((pdfjs) => {
      if (typeof window !== "undefined" && pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
      }
      return pdfjs;
    });
  }

  return pdfJsPromise;
}
