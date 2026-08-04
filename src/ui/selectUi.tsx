import * as Select from "@radix-ui/react-select";
import { forwardRef } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

const SELECT_VALUE_PREFIX = "core-select:";

export interface CoreSelectOption {
  value: string;
  label: string;
}

export interface CoreSelectProps {
  value: string;
  options: readonly CoreSelectOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
  testId?: string;
  autoFocus?: boolean;
  leadingIcon?: LucideIcon;
}

function encodeValue(value: string) {
  return SELECT_VALUE_PREFIX + value;
}

function decodeValue(value: string) {
  return value.slice(SELECT_VALUE_PREFIX.length);
}

function CoreSelectOptions({ options }: Pick<CoreSelectProps, "options">) {
  return options.map((option) => (
    <Select.Item
      key={option.value}
      value={encodeValue(option.value)}
      textValue={option.label}
      className="relative flex min-h-11 cursor-default select-none items-center rounded-lg py-2 pl-3 pr-9 core-body leading-5 text-[var(--core-text)] outline-none data-[highlighted]:bg-[var(--core-surface-muted)] data-[state=checked]:bg-[var(--core-info-surface)]"
    >
      <Select.ItemText className="min-w-0 break-words">{option.label}</Select.ItemText>
      <Select.ItemIndicator className="absolute right-3 grid place-items-center text-[var(--core-action-primary)]">
        <Check size={15} aria-hidden="true" />
      </Select.ItemIndicator>
    </Select.Item>
  ));
}

export const CoreSelect = forwardRef<HTMLButtonElement, CoreSelectProps>(function CoreSelect({
  value,
  options,
  onValueChange,
  ariaLabel,
  id,
  className = "",
  testId,
  autoFocus,
  leadingIcon: LeadingIcon,
}, ref) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";

  return (
    <Select.Root value={encodeValue(value)} onValueChange={(nextValue) => onValueChange(decodeValue(nextValue))}>
      <Select.Trigger
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        data-testid={testId}
        className={`group inline-flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-[var(--core-border-interactive)] bg-core-surface px-4 text-left core-body text-[var(--core-text)] transition hover:border-[var(--core-action-primary)] data-[state=open]:border-[var(--core-action-primary)] data-[state=open]:shadow-[0_0_0_2px_var(--core-focus-ring-soft)] ${className}`}
      >
        {LeadingIcon ? <LeadingIcon size={17} className="shrink-0 text-[var(--core-text-muted)]" aria-hidden="true" /> : null}
        <span className="min-w-0 flex-1 truncate">
          <Select.Value>{selectedLabel}</Select.Value>
        </span>
        <Select.Icon className="grid shrink-0 place-items-center text-[var(--core-action-primary)]">
          <ChevronDown size={16} className="transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="core-overlay z-[70] max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl outline-none"
        >
          <Select.ScrollUpButton className="grid h-8 cursor-default place-items-center text-[var(--core-text-muted)]">
            <ChevronDown size={16} className="rotate-180" aria-hidden="true" />
          </Select.ScrollUpButton>
          <Select.Viewport className="p-1">
            <CoreSelectOptions options={options} />
          </Select.Viewport>
          <Select.ScrollDownButton className="grid h-8 cursor-default place-items-center text-[var(--core-text-muted)]">
            <ChevronDown size={16} aria-hidden="true" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
});
