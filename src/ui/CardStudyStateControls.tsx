import type { ReactNode } from "react";
import { Ban, Star } from "lucide-react";
import { CardMarkButton } from "./coreUi.tsx";
import { CoreSwitch } from "./formControls.tsx";

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
      <span className={`core-field-label flex shrink-0 items-center gap-2 whitespace-nowrap ${disabled ? "text-core-muted" : ""}`}>
        <Icon className="shrink-0 text-core-muted" size={16} aria-hidden="true" />
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
        <CoreSwitch aria-label="Aussetzen" checked={suspended} disabled={disabled} onCheckedChange={onSuspendedChange} />
      </CardStudyStateRow>
    </div>
  );
}
