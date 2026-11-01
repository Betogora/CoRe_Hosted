import { useState } from "react";
import { ChevronDown, ChevronRight, Layers, PanelsTopLeft, Play } from "lucide-react";
import type { CoreMode, Deck } from "../coreTypes.ts";
import type { DeckMutationResult } from "../coreWorkspace.ts";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { EmptyState, SoftPanel } from "../ui/coreUi.tsx";
import { DeckOptionsMenu } from "../ui/DeckOptionsMenu.tsx";
import { DeckSummaryRow } from "../ui/DeckSummaryRow.tsx";
import { getDeckAppearance } from "../ui/deckAppearance.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";

interface DeckSubstacksPanelProps {
  rows: DeckLibraryRow[];
  current: DeckLibraryRow;
  decks: Deck[];
  hasStudyCards: boolean;
  onOpenCards: (deckId: string) => unknown;
  onStudy: (deck: Deck) => unknown;
  onOpenSettings: (deckId: string) => unknown;
  onSetCoreMode: (deckId: string, mode: CoreMode) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
}

/** Content tab "Unterstapel": expand descendants in place and open any visible deck directly. */
export function DeckSubstacksPanel({ rows, current, decks, hasStudyCards, onOpenCards, onStudy, onOpenSettings, onSetCoreMode, onMoveDeck }: DeckSubstacksPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const visibleRows: DeckLibraryRow[] = [];
  const visibleParents = new Set([current.id]);
  for (const row of rows) {
    if (!row.parentDeckId || !visibleParents.has(row.parentDeckId)) continue;
    visibleRows.push(row);
    if (expandedIds.has(row.id)) visibleParents.add(row.id);
  }
  function toggleExpanded(deckId: string) {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  }
  return (
    <SoftPanel className="grid min-w-0 gap-6 border border-core-border p-4 sm:p-6" aria-label={`Unterstapel von ${current.path}`} data-testid="deck-content-substacks">
      {visibleRows.length ? (
        <div className="core-deck-substack-list">
          {visibleRows.map((row) => {
            const expanded = expandedIds.has(row.id);
            const toggleLabel = `Unterstapel von ${row.path} ${expanded ? "ausblenden" : "anzeigen"}`;
            return (
              <div key={row.id} className="core-deck-summary-row relative min-w-0" data-testid={`content-substack-${row.id}`}>
                <button
                  type="button"
                  className="absolute inset-0 z-0 rounded-control text-left transition-colors hover:bg-core-subtle"
                  aria-label={`Stapel ${row.path} ${row.hasChildren ? expanded ? "zuklappen" : "aufklappen" : "öffnen"}`}
                  aria-expanded={row.hasChildren ? expanded : undefined}
                  onClick={() => row.hasChildren ? toggleExpanded(row.id) : onOpenCards(row.id)}
                />
                <DeckSummaryRow
                  row={{ ...row, depth: row.depth - current.depth - 1 }}
                  density="responsive"
                  learningStatus={{ summary: row.summary, metricLabels: "responsive" }}
                  leadingControl={row.hasChildren
                    ? <IconButton variant="ghost" label={toggleLabel} aria-expanded={expanded} icon={expanded ? ChevronDown : ChevronRight} className="pointer-events-auto" onClick={() => toggleExpanded(row.id)} />
                    : <span className="size-control shrink-0" aria-hidden="true" />}
                  actions={<>
                    <ActionButton variant="secondary" icon={PanelsTopLeft} className="pointer-events-auto" aria-label={`Karten von ${row.path} öffnen`} onClick={() => onOpenCards(row.id)}>Inhalte</ActionButton>
                    <CoreTooltip label={`${row.name} lernen`} deckAppearance={getDeckAppearance(row.deck)}>
                      <IconButton label={`${row.path} lernen`} icon={Play} className="pointer-events-auto" disabled={row.summary.totalCards === 0} onClick={() => onStudy(row.deck)} />
                    </CoreTooltip>
                    <DeckOptionsMenu row={row} decks={decks} onOpenSettings={onOpenSettings} onSetCoreMode={onSetCoreMode} onMoveDeck={onMoveDeck} />
                  </>}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Layers} title="Keine weiteren Unterstapel"
          action={<ActionButton variant="secondary" icon={PanelsTopLeft} onClick={() => onOpenCards(current.id)}>Karten öffnen</ActionButton>} />
      )}
      <div className="flex flex-wrap gap-2">
        <ActionButton variant="secondary" icon={PanelsTopLeft} onClick={() => onOpenCards(current.id)}>Alle Karten dieses Zweigs</ActionButton>
        <ActionButton variant="secondary" icon={Play} aria-label={`${current.path} lernen`} disabled={!hasStudyCards} onClick={() => onStudy(current.deck)}>Diesen Zweig lernen</ActionButton>
      </div>
    </SoftPanel>
  );
}
