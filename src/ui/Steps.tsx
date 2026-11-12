export interface StepItem {
  label: string;
  /** Marks this step as failed, whatever its position. */
  failed?: boolean;
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
  /** Spreads the steps evenly over the available width. */
  stretch?: boolean;
  /** Moves a light dash along the line after the current step while a process runs; static with reduced motion. */
  animated?: boolean;
  className?: string;
}

type StepState = "done" | "current" | "upcoming" | "failed";

const STATE_SUFFIX: Partial<Record<StepState, string>> = { done: ", erledigt", failed: ", fehlgeschlagen" };

function stepState(item: StepItem, index: number, current: number): StepState {
  if (item.failed) return "failed";
  return index < current ? "done" : index === current ? "current" : "upcoming";
}

/**
 * Steps of a process as one line of point and word: done in text color, current in action blue, upcoming muted,
 * failed in danger color. Below 520 px row width only the current word stays visible; the others remain readable
 * for assistive technology.
 */
export function Steps({ ariaLabel, items, current, onSelect, stretch = false, animated = false, className = "" }: StepsProps) {
  return (
    <div className={`core-steps ${className}`.trim()} data-stretch={stretch || undefined} data-animated={animated || undefined}>
      <ol aria-label={ariaLabel}>
        {items.map((item, index) => {
          const state = stepState(item, index, current);
          const content = (
            <>
              <span aria-hidden="true" className="core-steps-dot" />
              <span className="core-steps-label">{item.label}</span>
              {STATE_SUFFIX[state] ? <span className="sr-only">{STATE_SUFFIX[state]}</span> : null}
            </>
          );
          return (
            <li key={`${index}-${item.label}`} data-state={state} data-after-current={index === current + 1 || undefined} aria-current={index === current ? "step" : undefined}>
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
