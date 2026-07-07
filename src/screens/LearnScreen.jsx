import React from "react";
import { BookOpen, ChevronRight, Layers, PlusSquare, Sparkles } from "lucide-react";
import { createDeckLibraryModel } from "../libraryModel.js";
import { DonutValue, EmptyState, OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.jsx";

export function LearnScreen({ decks, onStartDeck, onCreateDeck, onOpenDecks }) {
  const library = createDeckLibraryModel(decks);

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Review"
        title="Lernen"
        body="Originale und variantenfokussierte Sessions."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={onOpenDecks} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-5 text-sm font-semibold text-[#4f5eb1]">
              <Layers size={17} aria-hidden="true" />
              Kartenstapel
            </button>
            <button type="button" onClick={onCreateDeck} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-5 text-sm font-semibold text-[#4f5eb1]">
              <PlusSquare size={17} aria-hidden="true" />
              Neue Karten
            </button>
          </div>
        }
      />

      {decks.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Keine Karten"
          body="Erstelle oder importiere zuerst einen Stapel."
          action={
            <button type="button" onClick={onCreateDeck} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eef1fb] px-5 text-sm font-semibold text-[#4f5eb1]">
              Erstellen <ChevronRight size={16} aria-hidden="true" />
            </button>
          }
        />
      ) : (
        library.rows.map((row) => {
          const deck = row.deck;
          const summary = row.summary;
          return (
            <SoftPanel key={deck.id} className="p-6">
              <div className="flex flex-wrap items-center gap-5" style={{ paddingLeft: `${Math.min(row.depth, 4) * 1.25}rem` }}>
                <OrbIcon icon={BookOpen} />
                <div className="min-w-[12rem] flex-1">
                  <h3 className="text-xl font-semibold text-[#17214f]">{deck.name}</h3>
                  <p className="mt-1 text-sm text-[#66709a]">{summary.dueCards} fällig · {summary.newCards} neu · {summary.totalCards} gesamt · {deck.deckSettings.coreMode}</p>
                </div>
                <div className="grid min-w-24 gap-1">
                  <span className="text-xs font-semibold text-[#66709a]">Maturity</span>
                  <span className="text-2xl font-semibold text-[#17214f]">{summary.averageMaturityXp}</span>
                </div>
                <DonutValue value={row.progress} />
                <button type="button" onClick={() => onStartDeck(deck, false)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f2f4fd] px-5 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
                  Lernen <ChevronRight size={16} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => onStartDeck(deck, true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-50 px-5 text-sm font-semibold text-amber-700 hover:bg-white">
                  Varianten <Sparkles size={16} aria-hidden="true" />
                </button>
              </div>
            </SoftPanel>
          );
        })
      )}
    </div>
  );
}
