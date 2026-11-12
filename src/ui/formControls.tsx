import React from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "defaultChecked" | "onChange" | "children" | "size" | "className" | "style">;

interface CheckableProps extends NativeInputProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Visible label; without it the caller names the input through `aria-label` or a surrounding `<label>`. */
  label?: ReactNode;
  description?: ReactNode;
  invalid?: boolean;
  className?: string;
}

export interface CoreCheckboxProps extends CheckableProps {
  /** Mixed state of a parent selection; the native input reports it as `indeterminate`. */
  indeterminate?: boolean;
  /** Subject colour instead of the action blue, e.g. an exam colour; `on` colours the check. */
  accent?: { fill: string; on: string };
}

export interface CoreRadioProps extends CheckableProps {
  name: string;
}

export interface CoreSwitchProps extends Omit<CheckableProps, "invalid"> {
  size?: "sm" | "md" | "lg";
  /** Side of the label next to the track. */
  labelPlacement?: "start" | "end";
}

// Spelled out in full: Tailwind keeps component-layer classes only when it finds their literal names.
const CHECKABLE_CLASSES = {
  checkbox: { root: "core-checkbox", content: "core-checkbox-content", control: "core-checkbox-control", label: "core-checkbox-label", description: "core-checkbox-description" },
  radio: { root: "core-radio", content: "core-radio-content", control: "core-radio-control", label: "core-radio-label", description: "core-radio-description" },
  switch: { root: "core-switch", content: "core-switch-content", control: "core-switch-control", label: "core-switch-label", description: "core-switch-description" },
} as const;

type CheckableKind = keyof typeof CHECKABLE_CLASSES;

function Checkable({ kind, checked, onCheckedChange, label, description, invalid = false, disabled = false, className = "", indicator, rootProps, inputRef, ...input }: CheckableProps & {
  kind: CheckableKind;
  indicator: ReactNode;
  rootProps: Record<string, unknown>;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const descriptionId = React.useId();
  const classes = CHECKABLE_CLASSES[kind];
  const describedBy = [input["aria-describedby"], description ? descriptionId : undefined].filter(Boolean).join(" ") || undefined;
  const control = (
    <span className={classes.control}>
      <input
        type={kind === "radio" ? "radio" : "checkbox"}
        role={kind === "switch" ? "switch" : undefined}
        {...input}
        ref={inputRef}
        checked={checked}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      {indicator}
    </span>
  );
  const root = { className: `${classes.root} ${className}`, "data-invalid": invalid || undefined, "data-disabled": disabled || undefined, ...rootProps };
  if (label === undefined) return <span {...root}>{control}</span>;
  return (
    <span {...root}>
      <label className={classes.content}>{control}<span className={classes.label}>{label}</span></label>
      {description ? <span id={descriptionId} className={classes.description}>{description}</span> : null}
    </span>
  );
}

/**
 * Checkbox after HeroUI v3 „Checkbox“ in CoRe colours: 16-px box with a drawn check, optional label and description,
 * invalid, disabled and indeterminate states. The native checkbox stays the focusable, labelled element.
 */
export function CoreCheckbox({ indeterminate = false, accent, ...props }: CoreCheckboxProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <Checkable
      {...props}
      kind="checkbox"
      inputRef={inputRef}
      rootProps={{
        "data-state": indeterminate ? "indeterminate" : props.checked ? "checked" : "unchecked",
        style: accent ? { "--core-check-accent": accent.fill, "--core-check-on-accent": accent.on } : undefined,
      }}
      indicator={indeterminate
        ? <svg className="core-checkbox-mark" data-mark="indeterminate" viewBox="0 0 24 24" aria-hidden="true"><line x1="21" x2="3" y1="12" y2="12" /></svg>
        : <svg className="core-checkbox-mark" viewBox="0 0 17 18" aria-hidden="true"><polyline points="1 9 7 14 15 4" /></svg>}
    />
  );
}

/** Radio in the checkbox's form: 16-px circle whose dot shrinks out of the accent fill. Grouped by `name`. */
export function CoreRadio(props: CoreRadioProps) {
  return <Checkable {...props} kind="radio" rootProps={{ "data-state": props.checked ? "checked" : "unchecked" }} indicator={<span className="core-radio-dot" aria-hidden="true" />} />;
}

/** On/off state after HeroUI v3 „Switch“: native checkbox with `role="switch"`, label before or after the track. */
export function CoreSwitch({ size = "md", labelPlacement = "end", ...props }: CoreSwitchProps) {
  return (
    <Checkable
      {...props}
      kind="switch"
      rootProps={{ "data-state": props.checked ? "checked" : "unchecked", "data-size": size, "data-label-placement": labelPlacement }}
      indicator={<span className="core-switch-thumb" aria-hidden="true" />}
    />
  );
}

interface GroupOption<T> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

interface GroupProps<T> {
  label: ReactNode;
  description?: ReactNode;
  /** Replaces the description and marks every option invalid. */
  errorMessage?: ReactNode;
  options: ReadonlyArray<GroupOption<T>>;
  disabled?: boolean;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

function ChoiceGroup({ role, label, description, errorMessage, orientation = "vertical", className = "", children }: Omit<GroupProps<unknown>, "options" | "disabled"> & { role: "group" | "radiogroup"; children: ReactNode }) {
  const labelId = React.useId();
  const hintId = React.useId();
  const hint = errorMessage ?? description;
  return (
    <div role={role} aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined} className={`core-choice-group ${className}`} data-orientation={orientation}>
      <span id={labelId} className="core-field-label">{label}</span>
      <div className="core-choice-group-options">{children}</div>
      {hint ? <span id={hintId} className={errorMessage ? "core-field-error" : "core-field-hint"}>{hint}</span> : null}
    </div>
  );
}

/** Several values from a set after HeroUI v3 „Checkbox Group“; the value keeps the order of `options`. */
export function CoreCheckboxGroup<T extends string>({ value, onValueChange, options, disabled = false, ...group }: GroupProps<T> & {
  value: ReadonlyArray<T>;
  onValueChange: (value: T[]) => void;
}) {
  return (
    <ChoiceGroup role="group" {...group}>
      {options.map((option) => (
        <CoreCheckbox
          key={option.value}
          value={option.value}
          label={option.label}
          description={option.description}
          checked={value.includes(option.value)}
          disabled={disabled || option.disabled}
          invalid={Boolean(group.errorMessage)}
          onCheckedChange={(checked) => onValueChange(options.map((item) => item.value).filter((item) => item === option.value ? checked : value.includes(item)))}
        />
      ))}
    </ChoiceGroup>
  );
}

/** One value from a set in the same form; values compare by identity, so booleans and numbers work as well. */
export function CoreRadioGroup<T extends string | number | boolean>({ value, onValueChange, options, name, disabled = false, ...group }: GroupProps<T> & {
  value: T;
  onValueChange: (value: T) => void;
  name?: string;
}) {
  const fallbackName = React.useId();
  return (
    <ChoiceGroup role="radiogroup" {...group}>
      {options.map((option) => (
        <CoreRadio
          key={String(option.value)}
          name={name ?? fallbackName}
          value={String(option.value)}
          label={option.label}
          description={option.description}
          checked={value === option.value}
          disabled={disabled || option.disabled}
          invalid={Boolean(group.errorMessage)}
          onCheckedChange={(checked) => { if (checked) onValueChange(option.value); }}
        />
      ))}
    </ChoiceGroup>
  );
}

export interface CoreSliderProps extends Omit<NativeInputProps, "value" | "min" | "max" | "step" | "defaultValue"> {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  /** Visible label above the track; without it `aria-label` or a `<label htmlFor>` names the slider. */
  label?: ReactNode;
  /** Visible and spoken value text; `null` hides the output. */
  formatValue?: ((value: number) => string) | null;
  className?: string;
}

/**
 * Slider after HeroUI v3 „Slider“: pill track with accent fill and thumb, value output, and a native range input for
 * pointer, keyboard (arrows, Page, Home/End) and assistive technology.
 */
export function CoreSlider({ value, min, max, step = 1, onValueChange, label, formatValue = String, className = "", id, disabled = false, ...input }: CoreSliderProps) {
  const fallbackId = React.useId();
  const inputId = id ?? fallbackId;
  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const text = formatValue ? formatValue(value) : null;
  return (
    <div className={`core-slider ${className}`} data-disabled={disabled || undefined} style={{ "--core-slider-ratio": ratio } as React.CSSProperties}>
      {label !== undefined ? <label htmlFor={inputId} className="core-slider-label">{label}</label> : null}
      {text !== null ? <output htmlFor={inputId} className="core-slider-output">{text}</output> : null}
      <span className="core-slider-track">
        <span className="core-slider-fill" aria-hidden="true" />
        <span className="core-slider-thumb" aria-hidden="true" />
        <input
          {...input}
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuetext={input["aria-valuetext"] ?? text ?? undefined}
          onChange={(event) => onValueChange(Number(event.target.value))}
        />
      </span>
    </div>
  );
}
