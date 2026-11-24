import React from "react";
import { Minus, Plus } from "lucide-react";
import { IconButton } from "./actionUi.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";

export interface CoreNumberFieldProps {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  unit?: string;
  testId?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  className?: string;
  /** Shows minus and plus buttons around the field instead of a unit; names the group and both buttons. */
  stepLabel?: string;
}

export function commitNumberInput(text: string, current: number, min: number, max: number) {
  const parsed = Number(text);
  if (!text.trim() || !Number.isFinite(parsed)) return current;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function CoreNumberField({ id, value, min, max, onChange, unit, testId = id, ariaLabel, ariaDescribedBy, className = "", stepLabel }: CoreNumberFieldProps) {
  const [inputValue, setInputValue] = React.useState(String(value));

  React.useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  function updateInput(nextValue: string) {
    setInputValue(nextValue);
    const parsed = Number(nextValue);
    if (!nextValue.trim() || !Number.isInteger(parsed) || parsed < min || parsed > max) return;
    onChange(parsed);
  }

  function commitInput() {
    const normalized = commitNumberInput(inputValue, value, min, max);
    setInputValue(String(normalized));
    if (normalized !== value) onChange(normalized);
  }

  const input = (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step="1"
      value={inputValue}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      data-testid={testId}
      className={stepLabel ? undefined : `core-field min-w-0 flex-1 tabular-nums ${unit ? "pr-14" : ""}`}
      onChange={(event) => updateInput(event.target.value)}
      onBlur={commitInput}
      onKeyDown={(event) => {
        if (event.key === "Enter") commitInput();
      }}
    />
  );

  if (stepLabel) {
    return (
      <div className={`core-number-stepper ${className}`} role="group" aria-label={stepLabel}>
        <CoreTooltip label={`${stepLabel} verringern`}><IconButton variant="ghost" label={`${stepLabel} verringern`} icon={Minus} disabled={value <= min} onClick={() => onChange(value - 1)} /></CoreTooltip>
        {input}
        <CoreTooltip label={`${stepLabel} erhöhen`}><IconButton variant="ghost" label={`${stepLabel} erhöhen`} icon={Plus} disabled={value >= max} onClick={() => onChange(value + 1)} /></CoreTooltip>
      </div>
    );
  }

  return (
    <span className={`relative flex min-w-0 ${className}`}>
      {input}
      {unit ? <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 core-body text-core-muted">{unit}</span> : null}
    </span>
  );
}
