import React from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import type { TagDirectoryEntry } from "../../tagDirectory.ts";
import { IconButton } from "../../ui/actionUi.tsx";
import { ActionDialog } from "../../ui/coreUi.tsx";

export interface TagManagerDialogProps {
  tags: readonly TagDirectoryEntry[];
  /** Renames, merges into an existing tag, or (without `to`) deletes a tag with its subtags, as a mass action. */
  onRename: (from: string, to: string | null) => Promise<void>;
  onClose: () => void;
}

const key = (tag: string) => tag.trim().toLocaleLowerCase("und");

/** Tag management of the account (KV5): rename with subtags, merge, delete, and where the tags come from. */
export function TagManagerDialog({ tags, onRename, onClose }: TagManagerDialogProps) {
  const [filter, setFilter] = React.useState("");
  const [editing, setEditing] = React.useState<{ tag: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const existing = React.useMemo(() => new Map(tags.map((entry) => [key(entry.tag), entry.tag])), [tags]);
  const shown = tags.filter((entry) => !filter.trim() || key(entry.tag).includes(key(filter)));

  async function run(from: string, to: string | null) {
    setBusy(true);
    try {
      await onRename(from, to);
      setEditing(null);
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  }

  const target = editing ? existing.get(key(editing.name)) : undefined;
  const mergesInto = editing && target && key(target) !== key(editing.tag) ? target : null;

  return (
    <ActionDialog
      open
      title="Tags verwalten"
      cancelLabel="Schließen"
      onCancel={onClose}
      description={(
        <div className="grid gap-3" data-testid="tag-manager">
          <input className="core-field w-full" value={filter} placeholder="Tags durchsuchen" aria-label="Tags durchsuchen" onChange={(event) => setFilter(event.target.value)} />
          {shown.length ? (
            <ul className="grid max-h-80 gap-1 overflow-y-auto" aria-label="Tags">
              {shown.map((entry) => (
                <li key={entry.tag} className="grid min-w-0 gap-1 rounded-inset px-1.5 py-1 hover:bg-core-subtle" data-tag={entry.tag}>
                  {editing?.tag === entry.tag ? (
                    <form className="flex min-w-0 items-center gap-1.5" onSubmit={(event) => {
                      event.preventDefault();
                      const name = editing.name.trim();
                      if (name && key(name) !== key(entry.tag)) void run(entry.tag, mergesInto ?? name);
                    }}>
                      <input className="core-field min-w-0 flex-1" value={editing.name} autoFocus aria-label={`Neuer Name für ${entry.tag}`} onChange={(event) => setEditing({ tag: entry.tag, name: event.target.value })} />
                      <IconButton type="submit" label={mergesInto ? `Mit ${mergesInto} zusammenführen` : "Umbenennen"} icon={Check} variant="secondary" disabled={busy} />
                      <IconButton label="Abbrechen" icon={X} variant="ghost" onClick={() => setEditing(null)} />
                    </form>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate core-body font-semibold text-core-text">{entry.tag}</span>
                      <span className="shrink-0 core-caption text-core-muted tabular-nums">
                        {entry.noteCount} {entry.noteCount === 1 ? "Inhalt" : "Inhalte"}{entry.importedCount ? ` · ${entry.importedCount === entry.noteCount ? "importiert" : `${entry.importedCount} importiert`}` : ""}
                      </span>
                      {confirmDelete === entry.tag ? (
                        <button type="button" className="shrink-0 core-body font-semibold text-core-danger-text hover:underline" disabled={busy} onClick={() => void run(entry.tag, null)}>Löschen bestätigen</button>
                      ) : (
                        <>
                          <IconButton label={`${entry.tag} umbenennen`} icon={Pencil} variant="ghost" onClick={() => { setConfirmDelete(null); setEditing({ tag: entry.tag, name: entry.tag }); }} />
                          <IconButton label={`${entry.tag} löschen`} icon={Trash2} variant="destructive-quiet" onClick={() => { setEditing(null); setConfirmDelete(entry.tag); }} />
                        </>
                      )}
                    </div>
                  )}
                  {editing?.tag === entry.tag && mergesInto ? <p className="core-caption text-core-muted">Führt mit dem vorhandenen Tag {mergesInto} zusammen.</p> : null}
                </li>
              ))}
            </ul>
          ) : <p className="core-body text-core-muted">Keine Tags</p>}
        </div>
      )}
    />
  );
}
