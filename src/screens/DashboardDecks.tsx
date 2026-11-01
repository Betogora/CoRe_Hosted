import { ArrowUpRight, Grid2x2, List, Play } from "lucide-react";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { IconButton } from "../ui/actionUi.tsx";
import { CoreIconSegmentedControl, SoftPanel } from "../ui/coreUi.tsx";
import { DeckSummaryHeader, DeckSummaryRow } from "../ui/DeckSummaryRow.tsx";
import { useStoredDeckTreeView } from "../ui/DeckTree.tsx";

/** A bounded entry point; hierarchy and management remain in the deck overview. */
export function DashboardDecks({ rows, onOpen, onActivate, onStudy }: {
  rows: DeckLibraryRow[];
  onOpen: () => void;
  onActivate: (row: DeckLibraryRow) => void;
  onStudy: (row: DeckLibraryRow) => void;
}) {
  const [view, setView] = useStoredDeckTreeView("core.dashboard.deckView.v1");
  const roots = rows.filter((row) => row.depth === 0);
  const selected = [...roots].sort((a, b) => b.dailyLearningSession.startableCount - a.dailyLearningSession.startableCount).slice(0, 3);
  return <SoftPanel className="dashboard-deck-teaser min-w-0 p-5 sm:p-6" data-deck-view={view}>
    <div className="flex flex-wrap items-center justify-between gap-2" data-testid="dashboard-deck-list-header">
      <h2 className="core-heading-3 font-semibold text-core-text">Aktive Stapel</h2>
      <div className="flex items-center gap-2"><CoreIconSegmentedControl ariaLabel="Stapelansicht" value={view} options={[{ value: "tiles", label: "Als Kacheln anzeigen", icon: Grid2x2 }, { value: "list", label: "Als Liste anzeigen", icon: List }]} onValueChange={setView} /><IconButton icon={ArrowUpRight} variant="ghost" label="Alle Stapel öffnen" onClick={onOpen} /></div>
    </div>
    <div className={`mt-4 ${view === "tiles" ? "dashboard-deck-mini-tiles" : "grid gap-2"}`}>
      {view === "list" ? <DeckSummaryHeader /> : null}
      {selected.map((row) => <div key={row.id} data-dashboard-deck={row.id} className="relative min-w-0 rounded-control border border-core-border p-2 hover:bg-core-hover">
        <button type="button" className="absolute inset-0 rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-core-focus" aria-label={`Stapel ${row.path} öffnen`} onClick={() => onActivate(row)} />
        <DeckSummaryRow row={row} density="responsive" presentation={view === "tiles" ? "subfolder" : "row"} leadingControl={null} actions={null} learningStatus={{ summary: row.summary, metricLabels: "sr-only" }} studyAction={<IconButton className="pointer-events-auto" icon={Play} variant="ghost" label={`${row.path} lernen`} onClick={() => onStudy(row)} />} />
      </div>)}
    </div>
    {roots.length > 3 ? <button type="button" className="core-action-ghost mt-3" onClick={onOpen}>Alle {roots.length} Hauptstapel ansehen</button> : null}
  </SoftPanel>;
}
