import React from "react";
import { ArrowLeft, Save, SlidersHorizontal } from "lucide-react";
import type { DeckSettingsScreenProps } from "../appScreenProps.ts";
import { normalizeDeckAppearance } from "../coreModel.ts";
import { LearningSettingsPanel } from "../ui/LearningSettingsPanel.tsx";
import { ColorWheelPicker } from "../ui/ColorWheelPicker.tsx";
import { DeckAppearanceIcon, deckIconOptions } from "../ui/deckAppearance.tsx";
import { EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.tsx";

export function DeckSettingsScreen({ deck, onSave, onSaveAppearance, onBack, backLabel = "Zurück zu Lernen" }: DeckSettingsScreenProps) {
  const [appearance, setAppearance] = React.useState(() => normalizeDeckAppearance(deck?.deckSettings?.appearance));
  const [appearanceStatus, setAppearanceStatus] = React.useState("");

  React.useEffect(() => {
    setAppearance(normalizeDeckAppearance(deck?.deckSettings?.appearance));
    setAppearanceStatus("");
  }, [deck?.id, deck?.deckSettings?.appearance?.iconKey, deck?.deckSettings?.appearance?.iconColor]);

  if (!deck) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title="Stapel nicht gefunden"
        body="Der ausgewählte Stapel ist nicht mehr verfügbar."
        action={
          <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--core-surface-muted)] px-4 core-body font-semibold text-[var(--core-action-primary)]">
            <ArrowLeft size={17} aria-hidden="true" />
            {backLabel}
          </button>
        }
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-7" data-testid={`deck-settings-${deck.id}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Stapel-Einstellungen" title={deck.name} />
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-4 core-body font-semibold text-[var(--core-action-primary)] transition hover:bg-core-surface">
          <ArrowLeft size={17} aria-hidden="true" />
          {backLabel}
        </button>
      </div>

      <SoftPanel className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <DeckAppearanceIcon appearance={appearance} className="size-12" />
          <div>
            <p className="core-body font-semibold uppercase tracking-wide text-[var(--core-action-secondary)]">Nur dieser Stapel</p>
            <p className="mt-1 core-body leading-6 text-[var(--core-text-muted)]">
              Änderungen gelten für „{deck.name}“. Andere Stapel behalten ihre eigenen Lernoptionen.
            </p>
          </div>
        </div>
        <form
          className="mt-5 grid min-w-0 gap-3 border-t border-[var(--core-border)] pt-5 sm:grid-cols-[minmax(11rem,1fr)_minmax(11rem,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveAppearance?.(deck.id, appearance);
            setAppearanceStatus("Stapeldarstellung gespeichert.");
          }}
        >
          <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
            Stapel-Icon
            <select className="min-h-11 rounded-xl border border-[var(--core-border)] bg-core-surface px-3" value={appearance.iconKey} onChange={(event) => setAppearance((current) => normalizeDeckAppearance({ ...current, iconKey: event.target.value }))}>
              {deckIconOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
            Iconfarbe
            <ColorWheelPicker
              value={appearance.iconColor}
              ariaLabel="Iconfarbe auswählen"
              className="justify-self-start"
              onValueCommit={(iconColor) => setAppearance((current) => normalizeDeckAppearance({ ...current, iconColor }))}
            />
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-[var(--core-surface-muted)] px-4 core-body font-semibold text-[var(--core-action-primary)]">
            <Save size={16} aria-hidden="true" />
            Darstellung speichern
          </button>
          {appearanceStatus ? <p className="core-body font-semibold text-[var(--core-text)] sm:col-span-3" role="status" aria-live="polite">{appearanceStatus}</p> : null}
        </form>
      </SoftPanel>

      <LearningSettingsPanel
        settings={deck.deckSettings}
        coreMode={deck.deckSettings?.coreMode}
        scopeTitle={`Lernen mit „${deck.name}“`}
        scopeDescription="Passe Tagespensum, Kartenreihenfolge und Intervalle gezielt für diesen Stapel an. Die vorhandenen Lernstände bleiben erhalten; neue Einstellungen wirken bei den nächsten Einplanungen."
        onSave={(settings: any) => onSave?.(deck.id, settings)}
      />
    </div>
  );
}
