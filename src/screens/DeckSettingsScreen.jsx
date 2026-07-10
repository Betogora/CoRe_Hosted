import React from "react";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { LearningSettingsPanel } from "../ui/LearningSettingsPanel.jsx";
import { DeckAppearanceIcon } from "../ui/deckAppearance.jsx";
import { EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.jsx";

export function DeckSettingsScreen({ deck, onSave, onBack }) {
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
          <DeckAppearanceIcon deck={deck} className="size-12 rounded-xl bg-[#eef1fb]" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">Nur dieser Stapel</p>
            <p className="mt-1 text-sm leading-6 text-[#66709a]">
              Änderungen gelten für „{deck.name}“. Andere Stapel behalten ihre eigenen Lernoptionen.
            </p>
          </div>
        </div>
      </SoftPanel>

      <LearningSettingsPanel
        settings={deck.deckSettings}
        coreMode={deck.deckSettings?.coreMode}
        scopeTitle={`Lernen mit „${deck.name}“`}
        scopeDescription="Passe Tagespensum, Kartenreihenfolge und Intervalle gezielt für diesen Stapel an. Die vorhandenen Lernstände bleiben erhalten; neue Einstellungen wirken bei den nächsten Einplanungen."
        onSave={(settings) => onSave?.(deck.id, settings)}
      />
    </div>
  );
}
