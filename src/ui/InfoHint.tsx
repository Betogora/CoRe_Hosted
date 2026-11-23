import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { Info } from "lucide-react";

const HOVER_OPEN_DELAY_MS = 300;
const HOVER_CLOSE_DELAY_MS = 200;

export interface InfoHintProps {
  /** Names what the hint explains; the button reads „Hinweis: {label}“. */
  label: string;
  children: string;
  /** Id of the hidden copy of the text, for `aria-describedby` of the explained control. */
  id?: string;
  className?: string;
}

export function InfoHint({ label, children, id, className = "" }: InfoHintProps) {
  /** `hover` closes once the mouse leaves button and text; `pinned` by a click or tap stays until dismissed. */
  const [open, setOpen] = React.useState<false | "hover" | "pinned">(false);
  const hoverTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownId = React.useId();
  const descriptionId = id ?? ownId;

  function clearHoverTimer() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }
  function hover(next: false | "hover", delay: number) {
    return (event: React.PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      clearHoverTimer();
      hoverTimer.current = setTimeout(() => setOpen((current) => current === "pinned" ? current : next), delay);
    };
  }
  React.useEffect(() => clearHoverTimer, []);

  return (
    <Popover.Root open={open !== false} onOpenChange={(next) => { if (!next) setOpen(false); }}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Hinweis: ${label}`}
          aria-describedby={descriptionId}
          className={`core-info-hint ${className}`.trim()}
          onPointerEnter={hover("hover", HOVER_OPEN_DELAY_MS)}
          onPointerLeave={hover(false, HOVER_CLOSE_DELAY_MS)}
          onClick={(event) => {
            // The click pins or closes; the trigger's own toggle would close a hint the hover just opened.
            event.preventDefault();
            clearHoverTimer();
            setOpen((current) => current === "pinned" ? false : "pinned");
          }}
          onKeyDown={(event) => {
            // The popover has taken this Escape; a dialog around the hint must not close with it.
            if (event.key === "Escape" && event.defaultPrevented) event.stopPropagation();
          }}
        >
          <Info size={16} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <span id={descriptionId} hidden>{children}</span>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          alignOffset={-12}
          sideOffset={6}
          collisionPadding={12}
          data-info-hint-content="true"
          className="core-overlay z-[90] w-max max-w-[min(20rem,calc(100vw-1.5rem))] rounded-panel px-3.5 py-3 core-body text-core-text outline-none"
          // The focus stays on the button, so its Escape closes only the hint.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => { if (open === "hover") event.preventDefault(); }}
          onPointerEnter={clearHoverTimer}
          onPointerLeave={hover(false, HOVER_CLOSE_DELAY_MS)}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
