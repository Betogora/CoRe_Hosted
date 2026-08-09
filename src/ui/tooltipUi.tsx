import React from "react";
import { createPortal } from "react-dom";

const TOOLTIP_ID = "core-tooltip";
const TOOLTIP_SELECTOR = "[data-core-tooltip]";
const TOOLTIP_OPEN_DELAY_MS = 300;
const TOOLTIP_CLOSE_DELAY_MS = 200;
const TOOLTIP_GAP_PX = 8;
const VIEWPORT_GUTTER_PX = 8;

type TooltipSource = "focus" | "pointer";

interface ActiveTooltip {
  label: string;
  swatchColor?: string;
  source: TooltipSource;
  trigger: HTMLElement;
  value?: string;
}

interface TooltipPosition {
  anchorX: number;
  left: number;
  side: "bottom" | "top";
  top: number;
}

const useTooltipLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function findTooltipTrigger(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(TOOLTIP_SELECTOR) : null;
}

function staysWithin(trigger: HTMLElement, relatedTarget: EventTarget | null) {
  return relatedTarget instanceof Node && trigger.contains(relatedTarget);
}

function clearTimer(timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timerRef.current === null) return;
  clearTimeout(timerRef.current);
  timerRef.current = null;
}

export function CoreTooltipProvider({ children }: { children: React.ReactNode }) {
  const [activeTooltip, setActiveTooltip] = React.useState<ActiveTooltip | null>(null);
  const [position, setPosition] = React.useState<TooltipPosition | null>(null);
  const activeTooltipRef = React.useRef<ActiveTooltip | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerFocusTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerFocusTriggerRef = React.useRef<HTMLElement | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement | null>(null);

  const close = React.useCallback(() => {
    clearTimer(timerRef);
    activeTooltipRef.current = null;
    setActiveTooltip(null);
  }, []);

  const open = React.useCallback((tooltip: ActiveTooltip, immediate: boolean) => {
    clearTimer(timerRef);

    const showTooltip = () => {
      timerRef.current = null;
      activeTooltipRef.current = tooltip;
      setPosition(null);
      setActiveTooltip(tooltip);
    };

    if (immediate || activeTooltipRef.current) showTooltip();
    else timerRef.current = setTimeout(showTooltip, TOOLTIP_OPEN_DELAY_MS);
  }, []);

  const scheduleClose = React.useCallback((trigger: HTMLElement, source: TooltipSource) => {
    clearTimer(timerRef);
    const current = activeTooltipRef.current;
    if (source === "pointer" && current?.trigger === trigger && current.source === "focus") return;

    timerRef.current = setTimeout(() => {
      if (activeTooltipRef.current?.trigger === trigger) close();
    }, TOOLTIP_CLOSE_DELAY_MS);
  }, [close]);

  useTooltipLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!activeTooltip || !tooltip) return;
    if (!activeTooltip.trigger.isConnected) {
      close();
      return;
    }

    const triggerRect = activeTooltip.trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const spaceAbove = triggerRect.top - VIEWPORT_GUTTER_PX;
    const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_GUTTER_PX;
    const side = spaceAbove >= tooltipRect.height + TOOLTIP_GAP_PX || spaceAbove >= spaceBelow ? "top" : "bottom";
    const idealLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    const maximumLeft = Math.max(VIEWPORT_GUTTER_PX, window.innerWidth - tooltipRect.width - VIEWPORT_GUTTER_PX);
    const left = clamp(idealLeft, VIEWPORT_GUTTER_PX, maximumLeft);
    const idealTop = side === "top"
      ? triggerRect.top - tooltipRect.height - TOOLTIP_GAP_PX
      : triggerRect.bottom + TOOLTIP_GAP_PX;
    const maximumTop = Math.max(VIEWPORT_GUTTER_PX, window.innerHeight - tooltipRect.height - VIEWPORT_GUTTER_PX);
    const top = clamp(idealTop, VIEWPORT_GUTTER_PX, maximumTop);
    const anchorX = clamp(triggerRect.left + triggerRect.width / 2 - left, 12, Math.max(12, tooltipRect.width - 12));

    setPosition({ anchorX, left, side, top });
  }, [activeTooltip, close]);

  React.useEffect(() => {
    const readTrigger = (event: Event) => {
      if (event.defaultPrevented) return null;
      const trigger = findTooltipTrigger(event.target);
      const label = trigger?.dataset.coreTooltip;
      return trigger && label ? {
        label,
        swatchColor: trigger.dataset.coreTooltipSwatch,
        trigger,
        value: trigger.dataset.coreTooltipValue,
      } : null;
    };
    const handlePointerOver = (event: PointerEvent) => {
      const tooltip = event.pointerType === "touch" ? null : readTrigger(event);
      if (tooltip && !staysWithin(tooltip.trigger, event.relatedTarget)) open({ ...tooltip, source: "pointer" }, false);
    };
    const handlePointerOut = (event: PointerEvent) => {
      const tooltip = readTrigger(event);
      if (tooltip && !staysWithin(tooltip.trigger, event.relatedTarget)) scheduleClose(tooltip.trigger, "pointer");
    };
    const handlePointerDown = (event: PointerEvent) => {
      const tooltip = readTrigger(event);
      if (!tooltip) return;
      pointerFocusTriggerRef.current = tooltip.trigger;
      clearTimer(pointerFocusTimerRef);
      pointerFocusTimerRef.current = setTimeout(() => {
        pointerFocusTriggerRef.current = null;
      }, 500);
      close();
    };
    const handlePointerCancel = () => {
      pointerFocusTriggerRef.current = null;
      clearTimer(pointerFocusTimerRef);
    };
    const handleFocusIn = (event: FocusEvent) => {
      const tooltip = readTrigger(event);
      if (!tooltip) return;
      if (pointerFocusTriggerRef.current === tooltip.trigger) {
        pointerFocusTriggerRef.current = null;
        return;
      }
      open({ ...tooltip, source: "focus" }, true);
    };
    const handleFocusOut = (event: FocusEvent) => {
      const tooltip = readTrigger(event);
      if (tooltip && !staysWithin(tooltip.trigger, event.relatedTarget)) scheduleClose(tooltip.trigger, "focus");
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activeTooltipRef.current) close();
    };
    const dismissOnViewportChange = () => {
      if (activeTooltipRef.current) close();
    };

    document.addEventListener("pointerover", handlePointerOver);
    document.addEventListener("pointerout", handlePointerOut);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointercancel", handlePointerCancel);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    window.addEventListener("keydown", dismissOnEscape);
    window.addEventListener("resize", dismissOnViewportChange);
    window.addEventListener("scroll", dismissOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointercancel", handlePointerCancel);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("keydown", dismissOnEscape);
      window.removeEventListener("resize", dismissOnViewportChange);
      window.removeEventListener("scroll", dismissOnViewportChange, true);
      clearTimer(timerRef);
      clearTimer(pointerFocusTimerRef);
    };
  }, [close, open, scheduleClose]);

  const tooltipStyle = {
    "--core-tooltip-anchor-x": `${position?.anchorX ?? 0}px`,
    left: position?.left ?? 0,
    top: position?.top ?? 0,
    visibility: position ? "visible" : "hidden",
  } as React.CSSProperties;

  return (
    <>
      {children}
      {activeTooltip && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={tooltipRef}
              id={TOOLTIP_ID}
              role="tooltip"
              data-side={position?.side ?? "top"}
              className="core-overlay core-tooltip"
              style={tooltipStyle}
              onPointerEnter={() => clearTimer(timerRef)}
              onPointerLeave={close}
            >
              {activeTooltip.swatchColor || activeTooltip.value ? (
                <span className="flex items-center justify-between gap-5 core-caption">
                  <span className="flex items-center gap-2 text-core-secondary">
                    {activeTooltip.swatchColor ? (
                      <span className="size-2.5 rounded-sm" style={{ backgroundColor: activeTooltip.swatchColor }} aria-hidden="true" />
                    ) : null}
                    {activeTooltip.label}
                  </span>
                  {activeTooltip.value ? <span className="font-semibold text-core-text">{activeTooltip.value}</span> : null}
                </span>
              ) : activeTooltip.label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

type TooltipChildProps = React.HTMLAttributes<HTMLElement> & {
  "data-core-tooltip"?: string;
  "data-core-tooltip-swatch"?: string;
  "data-core-tooltip-value"?: string;
  "aria-describedby"?: string;
  title?: string;
};

export function CoreTooltip({ label, swatchColor, value, children }: {
  label: string;
  swatchColor?: string;
  value?: string;
  children: React.ReactElement<TooltipChildProps>;
}) {
  const child = React.Children.only(children);
  return React.cloneElement(child, {
    "aria-describedby": [child.props["aria-describedby"], TOOLTIP_ID].filter(Boolean).join(" "),
    "data-core-tooltip": label,
    "data-core-tooltip-swatch": swatchColor,
    "data-core-tooltip-value": value,
    title: undefined,
  });
}
