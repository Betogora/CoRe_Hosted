import React from "react";
import { Layers, Save } from "lucide-react";
import type { DeckSettingsSaveScope } from "../appScreenProps.ts";
import { ActionButton } from "./actionUi.tsx";

interface SettingsSaveBarProps {
  open: boolean;
  savingScope?: DeckSettingsSaveScope | "global" | null;
  navigationBlocked?: boolean;
  mode?: "global" | "deck" | "deck-tree";
  onSave: (scope?: DeckSettingsSaveScope) => void;
}

export function SettingsSaveBar({ open, savingScope = null, navigationBlocked = false, mode = "global", onSave }: SettingsSaveBarProps) {
  if (!open) return null;

  const saving = savingScope !== null;
  const status = navigationBlocked ? "Zum Verlassen zuerst speichern." : "Änderungen speichern?";

  return (
    <aside
      aria-label="Änderungen speichern?"
      data-testid="settings-save-bar"
      className={`core-settings-save-bar core-overlay fixed left-[50dvw] z-50 grid w-[min(42rem,calc(100dvw-2rem))] -translate-x-1/2 gap-3 rounded-2xl p-3 ${mode === "deck-tree" ? "" : "sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"}`}
      style={{ bottom: "max(14dvh, calc(env(safe-area-inset-bottom) + 5rem))" }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="core-settings-save-badge grid size-9 shrink-0 place-items-center rounded-full" aria-hidden="true">
          <Save size={17} />
        </span>
        <p className="core-body font-semibold text-core-text" role="status" aria-live="polite">
          {status}
        </p>
      </div>
      {mode === "deck-tree" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton type="button" variant="primary" icon={Save} className="min-h-11 w-full justify-center" loading={savingScope === "deck"} disabled={saving} onClick={() => onSave("deck")}>
            Nur diesen Stapel speichern
          </ActionButton>
          <ActionButton type="button" variant="secondary" icon={Layers} className="min-h-11 w-full justify-center" loading={savingScope === "deck-tree"} disabled={saving} onClick={() => onSave("deck-tree")}>
            Stapel und Unterstapel speichern
          </ActionButton>
        </div>
      ) : (
        <ActionButton type="button" variant="primary" icon={Save} className="min-h-11 w-full justify-center sm:w-auto sm:min-w-36" loading={saving} disabled={saving} onClick={() => onSave(mode === "deck" ? "deck" : undefined)}>
          {mode === "deck" ? "Stapeleinstellungen speichern" : "Speichern"}
        </ActionButton>
      )}
    </aside>
  );
}
