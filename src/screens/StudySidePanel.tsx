import React from "react";
import { StatusMessage } from "../ui/feedbackUi.tsx";

const MIN_WIDTH = 320;
const MAX_SHARE = 0.6;
const KEYBOARD_STEP = 32;

// `clientWidth` leaves out the scrollbar, like the `right: 0` the panel is fixed to.
const viewportWidth = () => document.documentElement.clientWidth;

function clampWidth(width: number) {
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), Math.max(MIN_WIDTH, viewportWidth() * MAX_SHARE)));
}

interface StudySidePanelProps {
  id: string;
  open: boolean;
  renderContent: () => React.ReactNode;
  /** Width in px the open panel takes from the session, 0 while it is closed. */
  onWidthChange: (width: number) => void;
}

/** Once opened it stays mounted while closed, so closing keeps an unsaved draft. */
export function StudySidePanel({ id, open, renderContent, onWidthChange }: StudySidePanelProps) {
  const [mounted, setMounted] = React.useState(open);
  const [width, setWidth] = React.useState(() => clampWidth(viewportWidth() / 3));

  React.useEffect(() => { if (open) setMounted(true); }, [open]);
  React.useEffect(() => onWidthChange(open ? width : 0), [open, width, onWidthChange]);
  React.useEffect(() => {
    const fit = () => setWidth((current) => clampWidth(current));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => setWidth(clampWidth(viewportWidth() - moveEvent.clientX));
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function resizeByKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === "ArrowLeft" ? KEYBOARD_STEP : event.key === "ArrowRight" ? -KEYBOARD_STEP : 0;
    if (!delta) return;
    event.preventDefault();
    setWidth((current) => clampWidth(current + delta));
  }

  return (
    <aside id={id} className="core-study-side-panel" data-study-side-panel data-open={open || undefined} inert={!open} style={{ width }} aria-label="Zusammenfassung" data-testid="study-side-panel">
      <div
        className="core-study-side-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Breite anpassen"
        aria-valuemin={MIN_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={resizeByKey}
      />
      {mounted ? (
        <div className="core-study-side-content">
          <React.Suspense fallback={<StatusMessage tone="info" announce="polite">Wird geladen …</StatusMessage>}>
            {renderContent()}
          </React.Suspense>
        </div>
      ) : null}
    </aside>
  );
}
