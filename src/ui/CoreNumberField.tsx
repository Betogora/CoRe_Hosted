import React from "react";

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
}

/** The value a typed text resolves to on blur: rounded and clamped, or the current value for empty or non-numeric text. */
export function commitNumberInput(text: string, current: number, min: number, max: number) {
  const parsed = Number(text);
  if (!text.trim() || !Number.isFinite(parsed)) return current;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/** Integer field: valid in-range input applies immediately, anything else is clamped or restored on blur. */
export function CoreNumberField({ id, value, min, max, onChange, unit, testId = id, ariaLabel, ariaDescribedBy, className = "" }: CoreNumberFieldProps) {
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

  return (
    <span className={`relative flex min-w-0 ${className}`}>
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
        className={`core-field min-w-0 flex-1 tabular-nums ${unit ? "pr-14" : ""}`}
        onChange={(event) => updateInput(event.target.value)}
        onBlur={commitInput}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {unit ? <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 core-body text-core-muted">{unit}</span> : null}
    </span>
  );
}
