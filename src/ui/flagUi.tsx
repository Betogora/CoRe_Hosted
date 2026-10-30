import { Ban } from "lucide-react";
import { CrossLinkButton } from "./actionUi.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";

/** Anki's flag colors 1–7 in German; an own name from the profile replaces the color name. */
const FLAG_COLOR_NAMES = ["Rot", "Orange", "Grün", "Blau", "Rosa", "Türkis", "Lila"] as const;

const FLAGS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Visible name of a flag: the account's own name or the color name; empty for no flag. */
export function flagName(flag: number, names: readonly string[] = []): string {
  if (flag < 1 || flag > 7) return "";
  return names[flag - 1]?.trim() || FLAG_COLOR_NAMES[flag - 1];
}

/** A set flag as a color dot that is never recognizable by color alone (W14). */
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
  /** Links to the account's flag names (`karten-einstellungen`, target `flag-names`). */
  onEditNames?: () => void;
  disabled?: boolean;
  className?: string;
}

/** Seven flag dots on wide screens, a 4×2 grid with names and „Keine“ on narrow ones; Strg+1–7 in the tooltips. */
export function FlagPicker({ value, onValueChange, names, onEditNames, disabled = false, className = "" }: FlagPickerProps) {
  return (
    <div className={`grid min-w-0 gap-2 ${className}`}>
      <div role="group" aria-label="Flagge" className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-1" data-flag-picker="true">
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
                className={`core-flag-option flex min-h-control min-w-0 items-center gap-2 rounded-control border px-3 core-body font-semibold text-core-text transition hover:bg-core-subtle disabled:cursor-not-allowed disabled:opacity-60 sm:size-control sm:justify-center sm:px-0 ${pressed ? "border-core-action bg-core-subtle shadow-selection" : "border-transparent"}`}
              >
                <span aria-hidden="true" className="size-4 shrink-0 rounded-round" style={{ background: `var(--core-flag-${flag})` }} />
                <span className="min-w-0 truncate sm:sr-only">{name}</span>
              </button>
            </CoreTooltip>
          );
        })}
        <button
          type="button"
          aria-pressed={value === 0}
          disabled={disabled}
          onClick={() => onValueChange(0)}
          className={`flex min-h-control min-w-0 items-center gap-2 rounded-control border px-3 core-body font-semibold text-core-text transition hover:bg-core-subtle disabled:opacity-60 sm:hidden ${value === 0 ? "border-core-action bg-core-subtle shadow-selection" : "border-transparent"}`}
        >
          <Ban size={16} aria-hidden="true" className="shrink-0 text-core-muted" />
          <span className="min-w-0 truncate">Keine</span>
        </button>
      </div>
      {onEditNames ? <CrossLinkButton className="w-fit" onSelect={onEditNames}>Namen bearbeiten</CrossLinkButton> : null}
    </div>
  );
}
