import { Ban, Flag } from "lucide-react";
import { CrossLinkButton } from "./actionUi.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";

const FLAG_COLOR_NAMES = ["Rot", "Orange", "Grün", "Blau", "Rosa", "Türkis", "Lila"] as const;

const FLAGS = [1, 2, 3, 4, 5, 6, 7] as const;

export function flagName(flag: number, names: readonly string[] = []): string {
  if (flag < 1 || flag > 7) return "";
  return names[flag - 1]?.trim() || FLAG_COLOR_NAMES[flag - 1];
}

export function FlagIcon({ flag, size }: { flag: number; size: number }) {
  return <Flag aria-hidden="true" size={size} fill="currentColor" className="shrink-0" style={{ color: `var(--core-flag-${flag})` }} />;
}

export function FlagDot({ flag, names, size = 12 }: { flag: number; names?: readonly string[]; size?: number }) {
  if (flag < 1 || flag > 7) return null;
  const label = `Flagge ${flagName(flag, names)}`;
  return (
    <CoreTooltip label={label}>
      {/* The flag fills about two thirds of its box; four pixels more keep it as present as a dot of `size`. */}
      <span role="img" aria-label={label} className="inline-grid shrink-0"><FlagIcon flag={flag} size={size + 4} /></span>
    </CoreTooltip>
  );
}

export interface FlagPickerProps {
  value: number;
  /** 0 removes the flag; choosing the set flag again removes it as well. */
  onValueChange: (flag: number) => void;
  names?: readonly string[];
  onEditNames?: () => void;
  /** `false` where removing has its own action, such as the mass action „Flagge setzen“. */
  withNone?: boolean;
  disabled?: boolean;
  className?: string;
}

export function FlagPicker({ value, onValueChange, names, onEditNames, withNone = true, disabled = false, className = "" }: FlagPickerProps) {
  return (
    <div className={`grid min-w-0 gap-2 ${className}`}>
      <div role="group" aria-label="Flagge" className="grid grid-cols-4 gap-1 sm:-ml-3 sm:flex sm:flex-wrap sm:items-center" data-flag-picker="true">
        {FLAGS.map((flag) => {
          const name = flagName(flag, names);
          const pressed = value === flag;
          return (
            <CoreTooltip key={flag} label={`${name} · Strg+${flag}`}>
              <button
                type="button"
                aria-pressed={pressed}
                aria-label={`Flagge ${name}`}
                disabled={disabled}
                onClick={() => onValueChange(pressed ? 0 : flag)}
                className={`core-flag-option flex min-h-14 min-w-0 flex-col items-center justify-start gap-1 rounded-control pt-2.5 sm:justify-center sm:pt-0 border core-caption font-semibold text-core-text transition hover:bg-core-subtle disabled:cursor-not-allowed disabled:opacity-60 sm:size-control sm:min-h-0 ${pressed ? "border-core-action bg-core-subtle shadow-selection" : "border-transparent"}`}
              >
                <FlagIcon flag={flag} size={20} />
                <span className="max-w-full text-center leading-tight hyphens-auto break-words sm:sr-only">{name}</span>
              </button>
            </CoreTooltip>
          );
        })}
        {withNone ? (
          <CoreTooltip label="Keine Flagge">
            <button
              type="button"
              aria-pressed={value === 0}
              aria-label="Keine Flagge"
              disabled={disabled}
              onClick={() => onValueChange(0)}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-start gap-1 rounded-control pt-2.5 sm:justify-center sm:pt-0 border core-caption font-semibold text-core-text transition hover:bg-core-subtle disabled:cursor-not-allowed disabled:opacity-60 sm:size-control sm:min-h-0 ${value === 0 ? "border-core-action bg-core-subtle shadow-selection" : "border-transparent"}`}
            >
              <Ban size={16} aria-hidden="true" className="shrink-0 text-core-muted" />
              <span className="max-w-full truncate sm:sr-only">Keine</span>
            </button>
          </CoreTooltip>
        ) : null}
      </div>
      {onEditNames ? <CrossLinkButton className="w-fit" onSelect={onEditNames}>Namen bearbeiten</CrossLinkButton> : null}
    </div>
  );
}
