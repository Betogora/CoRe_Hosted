import React from "react";
import { finishFieldTiming } from "../fieldTimings.ts";
import { resolvePresentationMedia } from "../presentationFrame.ts";
import type { NotePresentationResult } from "../notePresentation.ts";
import { StatusMessage } from "./feedbackUi.tsx";

const PRESENTATION_FONT_SOURCES = [
  { path: "/fonts/manrope/manrope-variable.woff2", weight: "200 800" },
] as const;

let cachedPresentationFontCss = "";
let presentationFontCssPromise: Promise<string> | null = null;

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(typeof reader.result === "string" ? reader.result : ""), { once: true });
    reader.addEventListener("error", () => reject(reader.error), { once: true });
    reader.readAsDataURL(blob);
  });
}

function loadPresentationFontCss(): Promise<string> {
  if (cachedPresentationFontCss) return Promise.resolve(cachedPresentationFontCss);
  presentationFontCssPromise ??= Promise.all(PRESENTATION_FONT_SOURCES.map(async ({ path, weight }) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Kartenschrift konnte nicht geladen werden: ${response.status}`);
    const dataUrl = await blobDataUrl(await response.blob());
    return `@font-face{font-family:"Manrope Variable";src:url(${dataUrl}) format('woff2');font-style:normal;font-weight:${weight};font-display:swap}`;
  })).then((rules) => {
    cachedPresentationFontCss = rules.join("");
    return cachedPresentationFontCss;
  }).catch(() => "");
  return presentationFontCssPromise;
}

// `vh` inside the content-sized review frame would refer to the frame, so media get their limit from the window.
const REVIEW_MEDIA_HEIGHT = 0.5;
// A new review card starts at the last card's height, so the page below does not collapse and jump while it loads.
let lastReviewFrameHeight = 1;

/** Collapses and measures within one task, so the shrink is never painted. */
export function fitReviewFrameToContent(frame: HTMLIFrameElement, frameDocument: Document, viewportHeight: number) {
  frameDocument.documentElement.style.setProperty("--core-media-max-height", `${Math.round(viewportHeight * REVIEW_MEDIA_HEIGHT)}px`);
  frame.style.height = "1px";
  const height = Math.max(frameDocument.documentElement.scrollHeight, frameDocument.body.scrollHeight, 1);
  lastReviewFrameHeight = Math.ceil(height);
  frame.style.height = `${lastReviewFrameHeight}px`;
}

export interface CardPresentationSurfaceProps {
  presentation: NotePresentationResult | null;
  onTextSelectionChange?: (text: string) => void;
  surface?: "card-management" | "review";
  mediaUrls?: Record<string, string>;
  title: string;
  loadingLabel?: string;
  className?: string;
  /** Element of the card scrolled into view once loaded, like Anki's `#answer` after revealing. */
  scrollTargetId?: string;
}

export function CardPresentationSurface({
  presentation,
  onTextSelectionChange,
  surface = "card-management",
  mediaUrls = {},
  title,
  loadingLabel = "Kartendarstellung wird vorbereitet …",
  className = "",
  scrollTargetId,
}: CardPresentationSurfaceProps) {
  const [fontFaceCss, setFontFaceCss] = React.useState(cachedPresentationFontCss);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [initialReviewHeight] = React.useState(() => lastReviewFrameHeight);
  const frameFitCleanupRef = React.useRef<(() => void) | null>(null);
  const selectionCleanupRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    let active = true;
    void loadPresentationFontCss().then((css) => {
      if (active) setFontFaceCss(css);
    });
    return () => { active = false; };
  }, []);

  React.useEffect(() => () => { frameFitCleanupRef.current?.(); selectionCleanupRef.current?.(); }, []);

  const srcdoc = React.useMemo(
    () => presentation ? resolvePresentationMedia(presentation.srcdoc.replace("<style>", `<style>${fontFaceCss}`), mediaUrls) : "",
    [fontFaceCss, mediaUrls, presentation],
  );

  // A new document keeps the frame's height until it is measured on load; collapsing here showed as a blank jump.
  React.useLayoutEffect(() => {
    selectionCleanupRef.current?.();
    if (surface === "review") frameFitCleanupRef.current?.();
  }, [srcdoc, surface]);

  if (!presentation) {
    return <StatusMessage tone="info" announce="polite" className={className}>{loadingLabel}</StatusMessage>;
  }

  const frameClassName = surface === "review"
    ? `w-full border-0 bg-transparent${presentation.layout === "original" ? " rounded-panel" : ""}`
    : "min-h-72 w-full rounded-control border border-core-border bg-core-surface";
  const resizeReviewFrame = () => {
    if (surface !== "review") return;
    const frame = frameRef.current;
    const frameDocument = frame?.contentDocument;
    if (!frame || !frameDocument) return;
    const updateHeight = () => fitReviewFrameToContent(frame, frameDocument, window.innerHeight);
    frameFitCleanupRef.current?.();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateHeight);
    observer?.observe(frameDocument.body);
    window.addEventListener("resize", updateHeight);
    frameFitCleanupRef.current = () => { observer?.disconnect(); window.removeEventListener("resize", updateHeight); };
    updateHeight();
    // A revealed answer or the next card is on screen once its frame has loaded and is fitted.
    finishFieldTiming("card-frame");
  };
  return (
    <div className={`grid min-w-0 gap-3 ${className}`.trim()}>
      <div className="relative min-w-0">
        <iframe
          ref={frameRef}
          title={title}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          scrolling={surface === "review" ? "no" : undefined}
          referrerPolicy="no-referrer"
          srcDoc={srcdoc}
          className={frameClassName}
          style={surface === "review" ? { height: initialReviewHeight } : undefined}
          onLoad={() => {
            resizeReviewFrame();
            selectionCleanupRef.current?.();
            const frameDocument = frameRef.current?.contentDocument;
            if (scrollTargetId) frameDocument?.getElementById(scrollTargetId)?.scrollIntoView({ block: "nearest" });
            if (onTextSelectionChange && frameDocument) {
              const update = () => onTextSelectionChange(frameDocument.getSelection()?.toString().trim() ?? "");
              frameDocument.addEventListener("selectionchange", update);
              selectionCleanupRef.current = () => frameDocument.removeEventListener("selectionchange", update);
            }
          }}
        />
      </div>
    </div>
  );
}
