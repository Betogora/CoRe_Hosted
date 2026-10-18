import React from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { createDeckExplorerModel } from "../libraryModel.ts";
import { DeckTree, type DeckTreeProps } from "./DeckTree.tsx";

export function DeckExplorer({ rows, selectedDeckId, onSelectDeck, children, ...treeProps }: Omit<DeckTreeProps, "onActivate" | "presentation" | "selectedDeckId" | "headerAction" | "contentBeforeRows" | "viewMode" | "focusedDeckId"> & {
  selectedDeckId: string | null;
  onSelectDeck: (deckId: string | null) => unknown;
  children: React.ReactNode;
}) {
  const [navigationOpen, setNavigationOpen] = React.useState(false);
  const navigationId = React.useId();
  const { ancestors } = createDeckExplorerModel(rows, selectedDeckId);
  React.useEffect(() => {
    for (const row of ancestors.slice(0, -1)) {
      if (treeProps.collapsedDeckIds.includes(row.id)) treeProps.onDeckExpansionChange(row.id, true);
    }
  }, [selectedDeckId, rows, treeProps.collapsedDeckIds, treeProps.onDeckExpansionChange]);
  function selectDeck(deckId: string | null) {
    setNavigationOpen(false);
    onSelectDeck(deckId);
  }
  return (
    <div className="core-deck-explorer" data-testid="deck-explorer">
      <div className="core-deck-explorer-navigation">
        <button type="button" className="core-deck-explorer-disclosure" aria-expanded={navigationOpen} aria-controls={navigationId} onClick={() => setNavigationOpen((current) => !current)}>
          <Layers size={18} aria-hidden="true" />
          <span>Stapel wechseln</span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        <div id={navigationId} className="core-deck-explorer-tree" data-open={navigationOpen}>
          <DeckTree {...treeProps} mode="explorer" rows={rows} presentation="navigation" selectedDeckId={selectedDeckId} onActivate={(row) => selectDeck(row.id)} headerAction={
            <button type="button" className="min-h-control px-2 core-caption font-semibold text-core-secondary" onClick={() => selectDeck(null)} aria-current={selectedDeckId ? undefined : "location"}>Alle Stapel</button>
          } />
        </div>
      </div>
      <div className="core-deck-explorer-content">
        <nav className="core-deck-explorer-breadcrumbs" aria-label="Stapelpfad">
          <button type="button" onClick={() => selectDeck(null)} aria-current={selectedDeckId ? undefined : "page"}>Alle Stapel</button>
          {ancestors.map((row, index) => <React.Fragment key={row.id}>
            <ChevronRight size={14} aria-hidden="true" />
            <button type="button" onClick={() => selectDeck(row.id)} aria-current={index === ancestors.length - 1 ? "page" : undefined}>{row.name}</button>
          </React.Fragment>)}
        </nav>
        {children}
      </div>
    </div>
  );
}
