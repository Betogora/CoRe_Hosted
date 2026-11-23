import { Ban } from "lucide-react";
import { CrossLinkButton } from "./actionUi.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";

const FLAG_COLOR_NAMES = ["Rot", "Orange", "Grün", "Blau", "Rosa", "Türkis", "Lila"] as const;

const FLAGS = [1, 2, 3, 4, 5, 6, 7] as const;
const FLAG_OPTION = "flex min-h-14 min-w-0 flex-col items-center justify-start gap-1.5 rounded-control px-1 pt-2.5 pb-1.5 core-caption font-semibold text-core-text transition hover:bg-core-subtle disabled:cursor-not-allowed disabled:opacity-60 sm:w-14";

export function flagName(flag: number, names: readonly string[] = []): string {
  if (flag < 1 || flag > 7) return "";
  return names[flag - 1]?.trim() || FLAG_COLOR_NAMES[flag - 1];
}

export function FlagDot({ flag, names, size = 12 }: { flag: number; names?: readonly string[]; size?: number }) {
  if (flag < 1 || flag > 7) return null;
  const label = `Flagge ${flagName(flag, names)}`;
  return (
    <CoreTooltip label={label}>
      <span role="img" aria-label={label} className="inline-block shrink-0 rounded-round" style={{ width: size, height: size, background: `var(--core-flag-${flag})` }} />
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
      <div role="group" aria-label="Flagge" className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap" data-flag-picker="true">
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
                className={FLAG_OPTION}
              >
                <span aria-hidden="true" className="core-color-swatch-dot" style={{ backgroundColor: `var(--core-flag-${flag})` }} />
                <span className="max-w-full text-center leading-tight hyphens-auto break-words">{name}</span>
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
              className={FLAG_OPTION}
            >
              <span aria-hidden="true" className="core-color-swatch-dot"><Ban size={14} className="text-core-muted" /></span>
              <span className="max-w-full truncate">Keine</span>
            </button>
          </CoreTooltip>
        ) : null}
      </div>
      {onEditNames ? <CrossLinkButton className="w-fit" onSelect={onEditNames}>Namen bearbeiten</CrossLinkButton> : null}
    </div>
  );
}
