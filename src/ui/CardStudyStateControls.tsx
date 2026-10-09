import type { ReactNode } from "react";
import { Ban, Star } from "lucide-react";
import { CardMarkButton, CoreSegmentedControl } from "./coreUi.tsx";

const SUSPEND_OPTIONS = [
  { value: "active", label: "Nicht aussetzen" },
  { value: "suspended", label: "Aussetzen" },
] as const;

export interface CardStudyStateControlsProps {
  marked: boolean;
  suspended: boolean;
  onMarkedChange: (marked: boolean) => void;
  onSuspendedChange: (suspended: boolean) => void;
  disabled?: boolean;
  className?: string;
}

function CardStudyStateRow({ icon: Icon, label, children, disabled = false }: {
  icon: typeof Star;
  label: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-control flex-wrap items-center justify-between gap-x-3 gap-y-2 py-1" aria-disabled={disabled || undefined}>
      <span className={`flex shrink-0 items-center gap-3 whitespace-nowrap core-body font-semibold ${disabled ? "text-core-muted" : "text-core-secondary"}`}>
        <Icon className="shrink-0 text-core-text" size={18} aria-hidden="true" />
        <span>{label}</span>
      </span>
      {children}
    </div>
  );
}

export function CardStudyStateControls({
  marked,
  suspended,
  onMarkedChange,
  onSuspendedChange,
  disabled = false,
  className = "",
}: CardStudyStateControlsProps) {
  return (
    <div className={className} data-card-study-state-controls="true">
      <CardStudyStateRow icon={Star} label="Markieren" disabled={disabled}>
        <CardMarkButton marked={marked} disabled={disabled} onMarkedChange={onMarkedChange} />
      </CardStudyStateRow>
      <CardStudyStateRow icon={Ban} label="Aussetzen" disabled={disabled}>
        <CoreSegmentedControl
          value={suspended ? "suspended" : "active"}
          options={SUSPEND_OPTIONS}
          ariaLabel="Aussetzstatus der Karte"
          disabled={disabled}
          size="compact"
          className="ml-auto max-w-[15rem] flex-1 basis-48"
          onValueChange={(value) => onSuspendedChange(value === "suspended")}
        />
      </CardStudyStateRow>
    </div>
  );
}
