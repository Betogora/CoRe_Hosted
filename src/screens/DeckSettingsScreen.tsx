import React from "react";
import { ArrowLeft, Save, SlidersHorizontal } from "lucide-react";
import { normalizeDeckAppearance } from "../coreModel.ts";
import { LearningSettingsPanel } from "../ui/LearningSettingsPanel.tsx";
import { DeckAppearanceIcon, deckIconOptions } from "../ui/deckAppearance.tsx";
import { EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.tsx";

export function DeckSettingsScreen({ deck, onSave, onSaveAppearance, onBack }: any) {
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
          <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1]">
            <ArrowLeft size={17} aria-hidden="true" />
            Zurück zu Lernen
          </button>
        }
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-7" data-testid={`deck-settings-${deck.id}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Stapel-Einstellungen" title={deck.name} />
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-4 text-sm font-semibold text-[#4f5eb1] transition hover:bg-white">
          <ArrowLeft size={17} aria-hidden="true" />
          Zurück zu Lernen
        </button>
      </div>

      <SoftPanel className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <DeckAppearanceIcon appearance={appearance} className="size-12 rounded-xl bg-[#eef1fb]" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">Nur dieser Stapel</p>
            <p className="mt-1 text-sm leading-6 text-[#66709a]">
              Änderungen gelten für „{deck.name}“. Andere Stapel behalten ihre eigenen Lernoptionen.
            </p>
          </div>
        </div>
        <form
          className="mt-5 grid min-w-0 gap-3 border-t border-[#e3e7f5] pt-5 sm:grid-cols-[minmax(11rem,1fr)_minmax(11rem,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveAppearance?.(deck.id, appearance);
            setAppearanceStatus("Stapeldarstellung gespeichert.");
          }}
        >
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Stapel-Icon
            <select className="min-h-11 rounded-xl border border-[#dfe4f5] bg-white px-3" value={appearance.iconKey} onChange={(event) => setAppearance((current) => normalizeDeckAppearance({ ...current, iconKey: event.target.value }))}>
              {deckIconOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Iconfarbe
            <span className="flex min-h-11 items-center gap-3 rounded-xl border border-[#dfe4f5] bg-white px-3">
              <input type="color" className="size-8 cursor-pointer border-0 bg-transparent p-0" value={appearance.iconColor} onChange={(event) => setAppearance((current) => normalizeDeckAppearance({ ...current, iconColor: event.target.value }))} aria-label="Iconfarbe auswählen" />
              <span className="font-mono text-sm uppercase">{appearance.iconColor}</span>
            </span>
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1]">
            <Save size={16} aria-hidden="true" />
            Darstellung speichern
          </button>
          {appearanceStatus ? <p className="text-sm font-semibold text-[#15705a] sm:col-span-3" role="status" aria-live="polite">{appearanceStatus}</p> : null}
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
