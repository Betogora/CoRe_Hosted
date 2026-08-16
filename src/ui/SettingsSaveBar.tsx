import React from "react";
import { Save } from "lucide-react";
import { ActionButton } from "./actionUi.tsx";

interface SettingsSaveBarProps {
  open: boolean;
  saving?: boolean;
  navigationBlocked?: boolean;
  onSave: () => void;
}

export function SettingsSaveBar({ open, saving = false, navigationBlocked = false, onSave }: SettingsSaveBarProps) {
  if (!open) return null;

  const status = navigationBlocked ? "Zum Verlassen zuerst speichern." : "Ungespeicherte Änderungen";

  return (
    <aside
      aria-label="Ungespeicherte Änderungen"
      data-testid="settings-save-bar"
      className="core-overlay fixed left-[50dvw] z-50 grid w-[min(32rem,calc(100dvw-2rem))] -translate-x-1/2 gap-3 rounded-[18px] p-4 shadow-2xl ring-1 ring-[var(--core-focus-ring-soft)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      style={{ bottom: "max(14dvh, calc(env(safe-area-inset-bottom) + 5rem))" }}
    >
      <p className="core-body-large font-semibold text-core-text" role="status" aria-live="polite">
        {status}
      </p>
      <ActionButton type="button" variant="primary" icon={Save} className="min-h-11 w-full justify-center sm:w-auto sm:min-w-36" loading={saving} disabled={saving} onClick={onSave}>
        Speichern
      </ActionButton>
    </aside>
  );
}
