import React from "react";
import { AlertCircle, ChevronLeft, ChevronRight, FileText, Loader2, Minus, Plus, Scan } from "lucide-react";
import { loadPdfJs } from "../pdfRuntime.js";
import { createPdfSelectionBbox, firstSelectionRectOnPage, normalizePdfSelectionText } from "../pdfSelection.js";

const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const PAGE_HORIZONTAL_PADDING = 32;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 10) / 10));
}

function pageScale(pageEntry, containerWidth, zoom) {
  if (!pageEntry?.baseViewport?.width) return zoom;
  const availableWidth = Math.max(240, containerWidth - PAGE_HORIZONTAL_PADDING);
  return (availableWidth / pageEntry.baseViewport.width) * zoom;
}

function pdfErrorMessage(error) {
  if (error?.name === "PasswordException") return "Das PDF ist passwortgeschützt und kann hier nicht geöffnet werden.";
  if (error?.name === "InvalidPDFException") return "Die PDF-Datei ist beschädigt oder ungültig.";
  if (error?.name === "MissingPDFException") return "Die PDF-Datei ist nicht mehr verfügbar.";
  return "Das PDF konnte nicht angezeigt werden.";
}

function PdfPage({ entry, pdfjs, scale, scrollElement }) {
  const shellRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const textLayerRef = React.useRef(null);
  const [shouldRender, setShouldRender] = React.useState(false);
  const viewport = React.useMemo(() => entry.page.getViewport({ scale }), [entry.page, scale]);

  React.useEffect(() => {
    const element = shellRef.current;
    if (!element || !scrollElement || typeof IntersectionObserver === "undefined") {
      setShouldRender(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((item) => item.isIntersecting)) setShouldRender(true);
      },
      { root: scrollElement, rootMargin: "900px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollElement]);

  React.useEffect(() => {
    if (!shouldRender) return undefined;

    const canvas = canvasRef.current;
    const textLayerElement = textLayerRef.current;
    if (!canvas || !textLayerElement) return undefined;

    let disposed = false;
    let renderTask = null;
    let textLayer = null;
    const outputScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    textLayerElement.replaceChildren();
    textLayerElement.style.setProperty("--total-scale-factor", String(viewport.scale));

    async function renderPage() {
      renderTask = entry.page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
      });
      const textContent = await entry.page.getTextContent();
      if (disposed) return;
      textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayerElement, viewport });
      await Promise.all([renderTask.promise, textLayer.render()]);
    }

    renderPage().catch((error) => {
      if (!disposed && error?.name !== "RenderingCancelledException") console.error("PDF-Seite konnte nicht gerendert werden.", error);
    });

    return () => {
      disposed = true;
      renderTask?.cancel?.();
      textLayer?.cancel?.();
    };
  }, [entry.page, pdfjs, shouldRender, viewport]);

  return (
    <div
      ref={shellRef}
      className="core-pdf-page"
      data-pdf-page-number={entry.pageNumber}
      style={{ width: `${viewport.width}px`, height: `${viewport.height}px` }}
      aria-label={`PDF-Seite ${entry.pageNumber}`}
    >
      {shouldRender ? (
        <>
          <canvas ref={canvasRef} aria-hidden="true" />
          <div ref={textLayerRef} className="core-pdf-text-layer" />
        </>
      ) : (
        <div className="grid h-full place-items-center text-sm text-[#66709a]">Seite {entry.pageNumber} wird vorbereitet.</div>
      )}
    </div>
  );
}

export function PdfDocumentViewer({ document, src, onSelection }) {
  const viewerRef = React.useRef(null);
  const onSelectionRef = React.useRef(onSelection);
  const [scrollElement, setScrollElement] = React.useState(null);
  const [pdfjs, setPdfjs] = React.useState(null);
  const [pages, setPages] = React.useState([]);
  const [containerWidth, setContainerWidth] = React.useState(640);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [zoom, setZoom] = React.useState(1);
  const [status, setStatus] = React.useState("loading");
  const [errorMessage, setErrorMessage] = React.useState("");

  React.useEffect(() => {
    onSelectionRef.current = onSelection;
  }, [onSelection]);

  React.useEffect(() => {
    if (!scrollElement) return undefined;
    const updateWidth = () => setContainerWidth(Math.max(320, scrollElement.clientWidth));
    updateWidth();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [scrollElement]);

  React.useEffect(() => {
    if (!src) return undefined;
    let disposed = false;
    let loadingTask = null;
    setStatus("loading");
    setErrorMessage("");
    setPages([]);
    setCurrentPage(1);

    async function loadDocument() {
      const runtime = await loadPdfJs();
      if (disposed) return;
      setPdfjs(runtime);
      loadingTask = runtime.getDocument({ url: src });
      const pdf = await loadingTask.promise;
      const nextPages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        if (disposed) return;
        nextPages.push({ page, pageNumber, baseViewport: page.getViewport({ scale: 1 }) });
      }
      if (!disposed) {
        setPages(nextPages);
        setStatus("ready");
      }
    }

    loadDocument().catch((error) => {
      if (!disposed) {
        setStatus("error");
        setErrorMessage(pdfErrorMessage(error));
      }
    });

    return () => {
      disposed = true;
      void loadingTask?.destroy?.();
    };
  }, [src]);

  React.useEffect(() => {
    if (!scrollElement || pages.length === 0) return undefined;
    let frame = null;
    const updateCurrentPage = () => {
      frame = null;
      const containerRect = scrollElement.getBoundingClientRect();
      const target = containerRect.top + Math.min(120, containerRect.height * 0.25);
      let closest = { pageNumber: 1, distance: Number.POSITIVE_INFINITY };
      viewerRef.current?.querySelectorAll("[data-pdf-page-number]").forEach((element) => {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - target);
        if (distance < closest.distance) closest = { pageNumber: Number(element.dataset.pdfPageNumber), distance };
      });
      if (Number.isFinite(closest.pageNumber)) setCurrentPage(closest.pageNumber);
    };
    const onScroll = () => {
      if (frame == null) frame = window.requestAnimationFrame(updateCurrentPage);
    };
    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    updateCurrentPage();
    return () => {
      scrollElement.removeEventListener("scroll", onScroll);
      if (frame != null) window.cancelAnimationFrame(frame);
    };
  }, [pages.length, scrollElement]);

  function goToPage(pageNumber) {
    const nextPage = Math.min(pages.length, Math.max(1, pageNumber));
    viewerRef.current?.querySelector(`[data-pdf-page-number="${nextPage}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrentPage(nextPage);
  }

  function captureSelection() {
    const selection = window.getSelection?.();
    const selectedText = normalizePdfSelectionText(selection?.toString?.() ?? "");
    if (!selection || selection.isCollapsed || !selectedText || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const pageElement = startElement?.closest?.("[data-pdf-page-number]");
    if (!pageElement || !viewerRef.current?.contains(pageElement)) return;

    const pageNumber = Number(pageElement.dataset.pdfPageNumber);
    const pageEntry = pages[pageNumber - 1];
    if (!pageEntry) return;
    const pageRect = pageElement.getBoundingClientRect();
    const selectionRect = firstSelectionRectOnPage(range.getClientRects(), pageRect) ?? range.getBoundingClientRect();
    const scale = pageScale(pageEntry, containerWidth, zoom);
    const bbox = createPdfSelectionBbox({ selectionRect, pageRect, viewport: pageEntry.page.getViewport({ scale }) });
    onSelectionRef.current?.(selectedText, { pageNumber, bbox });
  }

  const pageCount = pages.length;

  return (
    <div className="min-h-[40rem] overflow-hidden rounded-[16px] border border-[#e3e7f5] bg-[#f8f9fe]" data-testid="pdf-document-viewer">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[#e8ecf8] bg-[#f8f9fe]/95 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-700">
            <FileText size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#17214f]">{document?.fileName ?? "PDF"}</p>
            <p className="truncate text-xs font-medium text-[#66709a]" role="status" aria-live="polite">
              {status === "ready" ? `Seite ${currentPage} von ${pageCount}` : status === "loading" ? "PDF wird geladen." : "PDF nicht verfügbar."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="PDF-Navigation">
          <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={status !== "ready" || currentPage <= 1} className="core-pdf-control" aria-label="Vorherige PDF-Seite">
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <span className="min-w-16 text-center text-xs font-semibold text-[#4e5b8c]" aria-hidden="true">{pageCount ? `${currentPage}/${pageCount}` : "–"}</span>
          <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={status !== "ready" || currentPage >= pageCount} className="core-pdf-control" aria-label="Nächste PDF-Seite">
            <ChevronRight size={17} aria-hidden="true" />
          </button>
          <span className="mx-1 h-6 w-px bg-[#dfe4f5]" aria-hidden="true" />
          <button type="button" onClick={() => setZoom((value) => clampZoom(value - ZOOM_STEP))} disabled={status !== "ready" || zoom <= MIN_ZOOM} className="core-pdf-control" aria-label="PDF verkleinern">
            <Minus size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setZoom(1)} disabled={status !== "ready" || zoom === 1} className="core-pdf-control min-w-16 px-2" aria-label="PDF an Breite anpassen">
            <Scan size={15} aria-hidden="true" />
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => setZoom((value) => clampZoom(value + ZOOM_STEP))} disabled={status !== "ready" || zoom >= MAX_ZOOM} className="core-pdf-control" aria-label="PDF vergrößern">
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {status === "error" ? (
        <div className="grid min-h-[37rem] place-items-center px-6 text-center" role="alert">
          <div className="max-w-md">
            <AlertCircle className="mx-auto text-red-600" size={28} aria-hidden="true" />
            <p className="mt-3 font-semibold text-[#17214f]">{errorMessage}</p>
            <p className="mt-1 text-sm text-[#66709a]">Du kannst die extrahierte Textquelle weiterhin für Karten verwenden.</p>
          </div>
        </div>
      ) : (
        <div
          ref={setScrollElement}
          className="core-pdf-scroll min-h-[37rem]"
          onPointerUp={captureSelection}
          onKeyUp={captureSelection}
          tabIndex={0}
          aria-label="PDF-Dokument"
        >
          {status === "loading" ? (
            <div className="grid min-h-[37rem] place-items-center text-sm font-medium text-[#66709a]">
              <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={18} aria-hidden="true" />PDF wird geladen.</span>
            </div>
          ) : (
            <div ref={viewerRef} className="core-pdf-pages">
              {pages.map((entry) => (
                <PdfPage key={entry.pageNumber} entry={entry} pdfjs={pdfjs} scale={pageScale(entry, containerWidth, zoom)} scrollElement={scrollElement} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
