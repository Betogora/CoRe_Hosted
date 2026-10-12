import React from "react";
import { ChevronRight, Layers, PanelsTopLeft, Play } from "lucide-react";
import type { CoreMode, Deck } from "../coreTypes.ts";
import type { DeckMutationResult } from "../coreWorkspace.ts";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { EmptyState, SoftPanel } from "../ui/coreUi.tsx";
import { DeckOptionsMenu } from "../ui/DeckOptionsMenu.tsx";
import { DeckSummaryRow } from "../ui/DeckSummaryRow.tsx";
import { getDeckAppearance } from "../ui/deckAppearance.tsx";
import { formatLearningCardCount } from "../ui/learningStatusUi.ts";
import { CoreTooltip } from "../ui/tooltipUi.tsx";

interface DeckSubstacksPanelProps {
  rows: DeckLibraryRow[];
  current: DeckLibraryRow;
  decks: Deck[];
  hasStudyCards: boolean;
  onOpenSubstack: (deckId: string) => unknown;
  onOpenCards: (deckId: string) => unknown;
  onStudy: (deck: Deck) => unknown;
  onOpenSettings: (deckId: string) => unknown;
  onSetCoreMode: (deckId: string, mode: CoreMode) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
}

export function DeckSubstacksPanel({ rows, current, decks, hasStudyCards, onOpenSubstack, onOpenCards, onStudy, onOpenSettings, onSetCoreMode, onMoveDeck }: DeckSubstacksPanelProps) {
  const directRows = rows.filter((row) => row.parentDeckId === current.id);
  return (
    <SoftPanel className="grid min-w-0 gap-6 border border-core-border p-4 sm:p-6" aria-label={`Unterstapel von ${current.path}`} data-testid="deck-content-substacks" data-substack-view="list">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h3 className="core-body-large font-semibold text-core-text">{directRows.length} direkte Unterstapel</h3>
      </div>
      {directRows.length ? <div className="core-deck-substack-list">
        {directRows.map((row) => <div key={row.id} className="core-deck-summary-row relative min-w-0" data-testid={`content-substack-${row.id}`}>
          <button type="button" className="absolute inset-0 z-0 rounded-control text-left hover:bg-[var(--core-focus-ring-soft)]"
            aria-label={`Unterstapel ${row.path} öffnen`} onClick={() => onOpenSubstack(row.id)} />
          <DeckSummaryRow row={{ ...row, depth: 0 }} presentation="row" density="responsive"
            description={`${formatLearningCardCount(row.summary.totalCards)}${row.descendantCount ? ` · ${row.descendantCount} Unterstapel` : ""}`}
            learningStatus={{ summary: row.summary, metricLabels: "responsive" }}
            leadingControl={row.hasChildren ? <IconButton variant="ghost" label={`Unterstapel von ${row.path} öffnen`} icon={ChevronRight} className="pointer-events-auto" onClick={() => onOpenSubstack(row.id)} /> : <span aria-hidden="true" />}
            actions={<>
              <ActionButton variant="secondary" icon={PanelsTopLeft} className="pointer-events-auto" aria-label={`Karten von ${row.path} öffnen`} onClick={() => onOpenCards(row.id)}>Inhalte</ActionButton>
              <CoreTooltip label={`${row.name} lernen`} deckAppearance={getDeckAppearance(row.deck)}>
                <IconButton label={`${row.path} lernen`} icon={Play} className="pointer-events-auto" disabled={row.summary.totalCards === 0 && row.deck.cardCount === 0} onClick={() => onStudy(row.deck)} />
              </CoreTooltip>
              <DeckOptionsMenu row={row} decks={decks} onOpenSettings={onOpenSettings} onSetCoreMode={onSetCoreMode} onMoveDeck={onMoveDeck} />
            </>} />
        </div>)}
      </div> : <EmptyState icon={Layers} title="Keine weiteren Unterstapel" body="Die Karten dieses Stapels findest du im Tab Karten."
        action={<ActionButton variant="secondary" icon={PanelsTopLeft} onClick={() => onOpenCards(current.id)}>Karten öffnen</ActionButton>} />}
      <div className="flex flex-wrap gap-2">
        <ActionButton variant="secondary" icon={PanelsTopLeft} onClick={() => onOpenCards(current.id)}>Alle Karten dieses Zweigs</ActionButton>
        <ActionButton variant="secondary" icon={Play} aria-label={`${current.name} lernen`} disabled={!hasStudyCards} onClick={() => onStudy(current.deck)}>Diesen Zweig lernen</ActionButton>
      </div>
    </SoftPanel>
  );
}
