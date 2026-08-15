import React from "react";
import { RotateCcw, Save } from "lucide-react";
import { ActionButton } from "./actionUi.tsx";

interface SettingsSaveBarProps {
  open: boolean;
  saving?: boolean;
  onDiscard: () => void;
  onSave: () => void;
}

export function SettingsSaveBar({ open, saving = false, onDiscard, onSave }: SettingsSaveBarProps) {
  if (!open) return null;

  return (
    <aside
      aria-label="Ungespeicherte Änderungen"
      data-testid="settings-save-bar"
      className="core-overlay fixed left-[50dvw] z-50 grid w-[min(26rem,calc(100dvw-2rem))] -translate-x-1/2 gap-3 rounded-[18px] p-4 shadow-[var(--core-shadow-raised)]"
      style={{ bottom: "max(14dvh, calc(env(safe-area-inset-bottom) + 5rem))" }}
    >
      <p className="core-body-large font-semibold text-core-text" role="status" aria-live="polite">
        Ungespeicherte Änderungen
      </p>
      <div className="grid grid-cols-2 gap-2">
        <ActionButton type="button" variant="secondary" icon={RotateCcw} className="min-h-11 w-full justify-center" disabled={saving} onClick={onDiscard}>
          Verwerfen
        </ActionButton>
        <ActionButton type="button" variant="primary" icon={Save} className="min-h-11 w-full justify-center" loading={saving} disabled={saving} onClick={onSave}>
          Speichern
        </ActionButton>
      </div>
    </aside>
  );
}
