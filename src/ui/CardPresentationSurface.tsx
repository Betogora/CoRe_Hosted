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
  const effectivePresentation = React.useMemo(() => {
    if (!item || !variant || !definition) return null;
    const root = typeof document === "undefined" ? null : document.documentElement;
    const theme = root?.dataset.theme === "dark" || root?.classList.contains("dark") ? "dark" : "light";
    return renderLearningItemPresentation({ item, variant, definition, side, surface, theme });
  }, [definition, item, side, surface, variant]);
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
