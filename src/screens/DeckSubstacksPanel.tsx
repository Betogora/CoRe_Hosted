import { useMemo, useState } from "react";
import type { CoreMode, Deck } from "../coreTypes.ts";
import type { DeckMutationResult } from "../coreWorkspace.ts";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { DeckTree } from "../ui/DeckTree.tsx";

interface DeckSubstacksPanelProps {
  rows: DeckLibraryRow[];
  current: DeckLibraryRow;
  onOpenDeck: (deckId: string) => unknown;
  onStudy: (deck: Deck) => unknown;
  onOpenSettings: (deckId: string) => unknown;
  onSetCoreMode: (deckId: string, mode: CoreMode) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
}

/** Content tab "Unterstapel": the opened deck's branch as the list group of `Lernen`, initially showing its direct subdecks. */
export function DeckSubstacksPanel({ rows, current, onOpenDeck, onStudy, onOpenSettings, onSetCoreMode, onMoveDeck }: DeckSubstacksPanelProps) {
  const [collapsedDeckIds, setCollapsedDeckIds] = useState(() => rows.filter((row) => row.hasChildren && row.id !== current.id).map((row) => row.id));
  const rootDeckIds = useMemo(() => [current.id], [current.id]);
  return (
    <div className="min-w-0" data-testid="deck-content-substacks">
      <DeckTree
        rows={rows}
        rootDeckIds={rootDeckIds}
        mode="content"
        collapsedDeckIds={collapsedDeckIds}
        onDeckExpansionChange={(deckId, expanded) => setCollapsedDeckIds((previous) => {
          const deckIds: readonly string[] = typeof deckId === "string" ? [deckId] : deckId;
          return expanded ? previous.filter((id) => !deckIds.includes(id)) : [...new Set([...previous, ...deckIds])];
        })}
        onActivate={(row) => onOpenDeck(row.id)}
        onStudy={(row) => onStudy(row.deck)}
        onOpenSettings={onOpenSettings}
        onSetDeckCoreMode={onSetCoreMode}
        onMoveDeck={onMoveDeck}
      />
    </div>
  );
}
