import React from "react";
import type { PresentationResult } from "../cardPresentation.ts";
import { renderLearningItemPresentation, resolvePresentationMedia } from "../cardPresentation.ts";
import type { CardVariant, LearningItem, NoteTypeDefinitionV1 } from "../coreTypes.ts";
import { StatusMessage } from "./feedbackUi.tsx";

const COMPATIBILITY_COPY: Record<PresentationResult["compatibility"], string> = {
  "safe-equivalent": "Originalgetreu und sicher dargestellt.",
  "safe-with-differences": "Sicher dargestellt, mit bekannten Plattformabweichungen.",
  "preserved-only": "Originaldaten erhalten; Darstellung aus Sicherheitsgründen vereinfacht.",
};

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

function readPresentationTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.coreTheme === "dark" ? "dark" : "light";
}

export interface CardPresentationSurfaceProps {
  item?: LearningItem | null;
  variant?: CardVariant | null;
  definition?: NoteTypeDefinitionV1 | null;
  side?: "question" | "answer";
  surface?: "editor-preview" | "card-management" | "review";
  mediaUrls?: Record<string, string>;
  title: string;
  loadingLabel?: string;
  showCompatibility?: boolean;
  className?: string;
}

export function CardPresentationSurface({
  item,
  variant,
  definition,
  side = "question",
  surface = "card-management",
  mediaUrls = {},
  title,
  loadingLabel = "Kartendarstellung wird vorbereitet …",
  showCompatibility = true,
  className = "",
}: CardPresentationSurfaceProps) {
  const [theme, setTheme] = React.useState<"light" | "dark">(readPresentationTheme);
  const [fontFaceCss, setFontFaceCss] = React.useState(cachedPresentationFontCss);

  React.useEffect(() => {
    let active = true;
    void loadPresentationFontCss().then((css) => {
      if (active) setFontFaceCss(css);
    });
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(readPresentationTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ["data-core-theme"] });
    return () => observer.disconnect();
  }, []);

  const effectivePresentation = React.useMemo(() => {
    if (!item || !variant || !definition) return null;
    return renderLearningItemPresentation({ item, variant, definition, side, surface, theme, fontFaceCss });
  }, [definition, fontFaceCss, item, side, surface, theme, variant]);
  const srcdoc = React.useMemo(
    () => effectivePresentation ? resolvePresentationMedia(effectivePresentation.srcdoc, mediaUrls) : "",
    [effectivePresentation, mediaUrls],
  );
  const descriptionId = React.useId();

  if (!effectivePresentation) {
    return <StatusMessage tone="info" announce="polite" className={className}>{loadingLabel}</StatusMessage>;
  }

  const warning = effectivePresentation.compatibility !== "safe-equivalent";
  return (
    <div className={`grid min-w-0 gap-3 ${className}`.trim()}>
      {showCompatibility ? (
        <StatusMessage tone={warning ? "warning" : "success"} announce="polite">
          <span id={descriptionId}>{COMPATIBILITY_COPY[effectivePresentation.compatibility]}</span>
          {effectivePresentation.diagnostics.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {effectivePresentation.diagnostics.map((diagnostic) => (
                <li key={`${diagnostic.code}:${diagnostic.detail ?? ""}`}>{diagnostic.message}</li>
              ))}
            </ul>
          ) : null}
        </StatusMessage>
      ) : null}
      <iframe
        title={title}
        aria-describedby={showCompatibility ? descriptionId : undefined}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={srcdoc}
        className="min-h-72 w-full rounded-xl border border-[var(--core-border)] bg-core-surface"
      />
    </div>
  );
}
