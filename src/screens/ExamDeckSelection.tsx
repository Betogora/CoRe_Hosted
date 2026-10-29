import React from "react";
import { ChevronDown, ChevronRight, Plus, Search, X } from "lucide-react";
import type { createDeckLibraryModel } from "../libraryModel.ts";
import { IconButton } from "../ui/actionUi.tsx";

/** Expansion and search only change the view; selecting a branch remains an exam-model operation. */
export function ExamDeckSelection({ rows, selected, onToggle }: {
  rows: ReturnType<typeof createDeckLibraryModel>["rows"]; selected: ReadonlySet<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const search = query.trim().toLocaleLowerCase("de-DE");
  const byId = new Map(rows.map((row) => [row.id, row]));
  const matches = new Set<string>();
  if (search) for (const row of rows) {
    if (!row.path.toLocaleLowerCase("de-DE").includes(search)) continue;
    for (let current: typeof row | undefined = row; current && !matches.has(current.id); current = current.parentDeckId ? byId.get(current.parentDeckId) : undefined) matches.add(current.id);
  }
  let hiddenBelow: number | null = null;
  const visible = rows.filter((row) => {
    if (search) return matches.has(row.id);
    if (hiddenBelow !== null && row.depth > hiddenBelow) return false;
    hiddenBelow = row.childrenCount && !expanded.has(row.id) ? row.depth : null;
    return true;
  });
  return <div className="grid min-w-0 gap-3" data-testid="exam-deck-selection">
    <div className="flex min-h-control min-w-0 items-center gap-2 rounded-control border border-core-border bg-core-surface px-3">
      <Search size={18} aria-hidden="true" className="shrink-0 text-core-muted" />
      <input type="text" role="searchbox" aria-label="Stapel durchsuchen" placeholder="Stapel durchsuchen" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-control min-w-0 flex-1 bg-transparent core-body text-core-text" />
      {query ? <IconButton label="Stapelsuche leeren" icon={X} variant="ghost" onClick={() => setQuery("")} /> : null}
    </div>
    <ul aria-label="Stapel für die Prüfung" className="grid max-h-[28rem] min-w-0 content-start gap-1 overflow-y-auto rounded-control border border-core-border p-1">
      {visible.map((row) => {
        const checked = selected.has(row.id);
        const open = Boolean(search) || expanded.has(row.id);
        return <li key={row.id} className="flex min-w-0 items-center rounded-inset hover:bg-core-subtle" style={{ marginInlineStart: `${Math.min(row.depth, 4) * 0.75}rem` }}>
          {row.childrenCount ? <IconButton variant="ghost" icon={open ? ChevronDown : ChevronRight} label={`${row.name}: Unterstapel ${open ? "einklappen" : "ausklappen"}`} aria-expanded={open} disabled={Boolean(search)} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} /> : <span className="w-[var(--core-control-height)] shrink-0" aria-hidden="true" />}
          <label className="flex min-h-control min-w-0 flex-1 cursor-pointer items-center gap-3 px-2 py-2">
            <span className="relative size-5 shrink-0">
              <input type="checkbox" aria-label={`${row.name}${row.childrenCount ? ", mit Unterstapeln" : ""}`} className="absolute inset-0 size-5 cursor-pointer appearance-none rounded-marker border border-core-border bg-core-surface checked:border-core-action checked:bg-core-action" checked={checked} onChange={(event) => onToggle(row.id, event.target.checked)} />
              {checked ? <Plus size={16} aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 text-core-on-accent" /> : null}
            </span>
            <span className="min-w-0 flex-1 break-words core-body text-core-text">{row.name}</span>
            <span className="shrink-0 core-caption text-core-muted">{row.summary.totalCards}</span>
          </label>
        </li>;
      })}
      {!visible.length ? <li className="px-3 py-4 core-body text-core-muted">Keine Stapel gefunden.</li> : null}
    </ul>
  </div>;
}
