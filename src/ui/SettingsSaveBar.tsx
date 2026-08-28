import React from "react";
import { Layers, Save, X } from "lucide-react";
import type { SettingsSaveScope } from "../appScreenProps.ts";
import { ActionButton, IconButton } from "./actionUi.tsx";

interface SettingsSaveBarProps {
  open: boolean;
  savingScope?: SettingsSaveScope | "global" | null;
  navigationBlocked?: boolean;
  mode?: "global" | "learning-global" | "deck" | "deck-tree";
  onSave: (scope?: SettingsSaveScope) => void;
  onDiscard: () => void;
}

export function SettingsSaveBar({ open, savingScope = null, navigationBlocked = false, mode = "global", onSave, onDiscard }: SettingsSaveBarProps) {
  if (!open) return null;

  const saving = savingScope !== null;
  const status = navigationBlocked ? "Zum Verlassen zuerst speichern." : "Änderungen speichern?";

  return (
    <aside
      aria-label="Änderungen speichern?"
      data-testid="settings-save-bar"
      className={`core-settings-save-bar core-overlay fixed left-[50dvw] z-50 grid w-[min(42rem,calc(100dvw-2rem))] -translate-x-1/2 gap-3 rounded-2xl p-3 ${mode === "deck-tree" || mode === "learning-global" ? "" : "sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"}`}
      style={{ bottom: "max(14dvh, calc(env(safe-area-inset-bottom) + 5rem))" }}
    >
      <div className={`flex min-w-0 items-center gap-3 ${mode === "deck-tree" || mode === "learning-global" ? "pr-12" : "pr-12 sm:pr-0"}`}>
        <span className="core-settings-save-badge grid size-9 shrink-0 place-items-center rounded-full" aria-hidden="true">
          <Save size={17} />
        </span>
        <p className="core-body font-semibold text-core-text" role="status" aria-live="polite">
          {status}
        </p>
      </div>
      <IconButton
        type="button"
        variant="ghost"
        icon={X}
        label="Änderungen verwerfen"
        disabled={saving}
        className={mode === "deck-tree" || mode === "learning-global" ? "absolute right-2 top-2 rounded-xl" : "absolute right-2 top-2 rounded-xl sm:static sm:col-start-3 sm:row-start-1"}
        onClick={onDiscard}
      />
      {mode === "deck-tree" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton type="button" variant="primary" icon={Layers} className="min-h-11 w-full justify-center" loading={savingScope === "deck-tree"} disabled={saving} onClick={() => onSave("deck-tree")}>
            Stapel und Unterstapel speichern
          </ActionButton>
          <ActionButton type="button" variant="secondary" icon={Save} className="min-h-11 w-full justify-center" loading={savingScope === "deck"} disabled={saving} onClick={() => onSave("deck")}>
            Nur diesen Stapel speichern
          </ActionButton>
        </div>
      ) : mode === "learning-global" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton type="button" variant="primary" icon={Layers} className="min-h-11 w-full justify-center" loading={savingScope === "all-decks"} disabled={saving} onClick={() => onSave("all-decks")}>
            Auf alle Stapel anwenden
          </ActionButton>
          <ActionButton type="button" variant="secondary" icon={Save} className="min-h-11 w-full justify-center" loading={savingScope === "new-decks"} disabled={saving} onClick={() => onSave("new-decks")}>
            Auf alle neuen Stapel anwenden
          </ActionButton>
        </div>
      ) : (
        <ActionButton type="button" variant="primary" icon={Save} className="min-h-11 w-full justify-center sm:col-start-2 sm:row-start-1 sm:w-auto sm:min-w-36" loading={saving} disabled={saving} onClick={() => onSave(mode === "deck" ? "deck" : undefined)}>
          {mode === "deck" ? "Stapeleinstellungen speichern" : "Speichern"}
        </ActionButton>
      )}
    </aside>
  );
}
