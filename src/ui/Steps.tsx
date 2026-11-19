import { Check } from "lucide-react";

export interface StepItem {
  label: string;
  /** Only with `onSelect`: the step cannot be chosen yet. */
  disabled?: boolean;
}

export interface StepsProps {
  ariaLabel: string;
  items: ReadonlyArray<StepItem>;
  /** Index of the current step; `items.length` marks every step as done. */
  current: number;
  /** Makes every step a button; the caller decides which steps are reachable via `disabled`. */
  onSelect?: (index: number) => void;
  className?: string;
}

type StepState = "done" | "current" | "upcoming";

function stepState(index: number, current: number): StepState {
  return index < current ? "done" : index === current ? "current" : "upcoming";
}

/**
 * Numbered steps of a process spread over the row: done with a check, current in action blue, upcoming muted.
 * Below 520 px row width only the current word stays visible; the others remain readable for assistive technology.
 */
export function Steps({ ariaLabel, items, current, onSelect, className = "" }: StepsProps) {
  return (
    <div className={`core-steps ${className}`.trim()}>
      <ol aria-label={ariaLabel}>
        {items.map((item, index) => {
          const state = stepState(index, current);
          const content = (
            <>
              <span aria-hidden="true" className="core-steps-marker">{state === "done" ? <Check size={14} strokeWidth={2.5} /> : index + 1}</span>
              <span className="core-steps-label">{item.label}</span>
              {state === "done" ? <span className="sr-only">, erledigt</span> : null}
            </>
          );
          return (
            <li key={`${index}-${item.label}`} data-state={state} aria-current={index === current ? "step" : undefined}>
              {index > 0 ? <span aria-hidden="true" className="core-steps-line" /> : null}
              {onSelect ? (
                <button type="button" className="core-steps-step" disabled={item.disabled} onClick={() => onSelect(index)}>{content}</button>
              ) : (
                <span className="core-steps-step">{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
