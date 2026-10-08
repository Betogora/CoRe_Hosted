import React from "react";
import { resolvePresentationMedia } from "../cardPresentationFrame.ts";
import type { NotePresentationResult } from "../notePresentation.ts";
import { StatusMessage } from "./feedbackUi.tsx";

const PRESENTATION_FONT_SOURCES = [
  { path: "/fonts/synonym-400.woff2", weight: 400 },
  { path: "/fonts/synonym-500.woff2", weight: 500 },
  { path: "/fonts/synonym-600.woff2", weight: 600 },
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
    return `@font-face{font-family:Synonym;src:url(${dataUrl}) format('woff2');font-style:normal;font-weight:${weight};font-display:swap}`;
  })).then((rules) => {
    cachedPresentationFontCss = rules.join("");
    return cachedPresentationFontCss;
  }).catch(() => "");
  return presentationFontCssPromise;
}

export function fitReviewFrameToContent(frame: HTMLIFrameElement, frameDocument: Document) {
  frame.style.height = "1px";
  const height = Math.max(frameDocument.documentElement.scrollHeight, frameDocument.body.scrollHeight, 1);
  frame.style.height = `${Math.ceil(height)}px`;
}

export interface CardPresentationSurfaceProps {
  presentation: NotePresentationResult | null;
  onTextSelectionChange?: (text: string) => void;
  surface?: "card-management" | "review";
  mediaUrls?: Record<string, string>;
  title: string;
  loadingLabel?: string;
  showCompatibility?: boolean | "warnings-only";
  cornerBadge?: React.ReactNode;
  className?: string;
}

export function CardPresentationSurface({
  presentation,
  onTextSelectionChange,
  surface = "card-management",
  mediaUrls = {},
  title,
  loadingLabel = "Kartendarstellung wird vorbereitet …",
  showCompatibility = true,
  cornerBadge,
  className = "",
}: CardPresentationSurfaceProps) {
  const [fontFaceCss, setFontFaceCss] = React.useState(cachedPresentationFontCss);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const frameResizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const selectionCleanupRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    let active = true;
    void loadPresentationFontCss().then((css) => {
      if (active) setFontFaceCss(css);
    });
    return () => { active = false; };
  }, []);

  React.useEffect(() => () => { frameResizeObserverRef.current?.disconnect(); selectionCleanupRef.current?.(); }, []);

  const srcdoc = React.useMemo(
    () => presentation ? resolvePresentationMedia(presentation.srcdoc.replace("<style>", `<style>${fontFaceCss}`), mediaUrls) : "",
    [fontFaceCss, mediaUrls, presentation],
  );
  const descriptionId = React.useId();

  React.useLayoutEffect(() => {
    selectionCleanupRef.current?.();
    if (surface !== "review") return;
    frameResizeObserverRef.current?.disconnect();
    if (frameRef.current) frameRef.current.style.height = "1px";
  }, [srcdoc, surface]);

  if (!presentation) {
    return <StatusMessage tone="info" announce="polite" className={className}>{loadingLabel}</StatusMessage>;
  }

  const warning = presentation.diagnostics.length > 0;
  const compatibilityVisible = showCompatibility === "warnings-only" ? warning : showCompatibility;
  const frameClassName = surface === "review"
    ? "h-px w-full border-0 bg-transparent"
    : "min-h-72 w-full rounded-control border border-core-border bg-core-surface";
  const resizeReviewFrame = () => {
    if (surface !== "review") return;
    const frame = frameRef.current;
    const frameDocument = frame?.contentDocument;
    if (!frame || !frameDocument) return;
    const updateHeight = () => fitReviewFrameToContent(frame, frameDocument);
    frameResizeObserverRef.current?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      frameResizeObserverRef.current = new ResizeObserver(updateHeight);
      frameResizeObserverRef.current.observe(frameDocument.body);
    }
    updateHeight();
  };
  return (
    <div className={`grid min-w-0 gap-3 ${className}`.trim()}>
      {compatibilityVisible ? (
        <StatusMessage id={descriptionId} tone={warning ? "warning" : "success"} announce="polite">
          <span>{warning ? "Sicher dargestellt, mit bekannten Abweichungen vom Original." : "Originalgetreu und sicher dargestellt."}</span>
          {warning ? (
            <ul className="mt-2 list-disc space-y-1 pl-6">
              {presentation.diagnostics.map((diagnostic) => (
                <li key={`${diagnostic.code}:${diagnostic.detail ?? ""}`}>{diagnostic.message}</li>
              ))}
            </ul>
          ) : null}
        </StatusMessage>
      ) : null}
      <div className="relative min-w-0">
        {cornerBadge ? <div className="pointer-events-none absolute right-3 top-3 z-10">{cornerBadge}</div> : null}
        <iframe
          ref={frameRef}
          title={title}
          aria-describedby={compatibilityVisible ? descriptionId : undefined}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          scrolling={surface === "review" ? "no" : undefined}
          referrerPolicy="no-referrer"
          srcDoc={srcdoc}
          className={frameClassName}
          onLoad={() => {
            resizeReviewFrame();
            selectionCleanupRef.current?.();
            const frameDocument = frameRef.current?.contentDocument;
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
