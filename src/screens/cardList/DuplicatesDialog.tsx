import React from "react";
import type { DuplicateGroup, DuplicateKey } from "../../duplicateContents.ts";
import { ActionDialog } from "../../ui/coreUi.tsx";
import { CoreSelect } from "../../ui/selectUi.tsx";

const SORT_FIELD = "sortField";
const FIELD_PREFIX = "field:";

export interface DuplicatesDialogProps {
  /** With a search the comparison can stay within its hits. */
  searching: boolean;
  find: (key: DuplicateKey, withinHits: boolean) => Promise<{ fieldNames: string[]; groups: DuplicateGroup[] }>;
  deckName: (deckId: string) => string;
  onOpen: (deckId: string, cardId: string) => void;
  /** Tags every content of the groups with `Duplikat`, as a mass action with `Rückgängig`. */
  onTag: (cardIds: string[]) => Promise<void>;
  onClose: () => void;
}

/** `Duplikate finden` (KV5): contents with the same field or sort field text, to open, tag or delete. */
export function DuplicatesDialog({ searching, find, deckName, onOpen, onTag, onClose }: DuplicatesDialogProps) {
  const [target, setTarget] = React.useState(SORT_FIELD);
  const [withinHits, setWithinHits] = React.useState(searching);
  const [result, setResult] = React.useState<{ fieldNames: string[]; groups: DuplicateGroup[] } | null>(null);
  const [error, setError] = React.useState("");
  const [tagging, setTagging] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setError("");
    find(target === SORT_FIELD ? "sortField" : { field: target.slice(FIELD_PREFIX.length) }, withinHits).then(
      (found) => active && setResult(found),
      (failure: unknown) => active && setError(failure instanceof Error ? failure.message : "Duplikate konnten nicht gesucht werden."),
    );
    return () => {
      active = false;
    };
  }, [attempt, find, target, withinHits]);

  const groups = result?.groups ?? [];
  const contentCount = groups.reduce((count, group) => count + group.contents.length, 0);

  async function tag() {
    if (!groups.length) return;
    setTagging(true);
    try {
      await onTag(groups.flatMap((group) => group.contents.flatMap((content) => content.cardIds)));
      onClose();
    } finally {
      setTagging(false);
    }
  }

  return (
    <ActionDialog
      open
      title="Duplikate finden"
      confirmLabel="Duplikate taggen"
      cancelLabel="Schließen"
      confirmLoading={tagging}
      onCancel={onClose}
      onConfirm={() => void tag()}
      description={(
        <div className="grid gap-3" data-testid="duplicates-dialog">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <CoreSelect
              ariaLabel="Vergleichen nach"
              className="min-w-40"
              value={target}
              options={[{ value: SORT_FIELD, label: "Sortierfeld" }, ...(result?.fieldNames ?? []).map((name) => ({ value: `${FIELD_PREFIX}${name}`, label: name }))]}
              onValueChange={setTarget}
            />
            {searching ? (
              <label className="flex items-center gap-2 core-body text-core-text">
                <input type="checkbox" className="size-5 shrink-0 accent-core-action" checked={withinHits} onChange={(event) => setWithinHits(event.target.checked)} />
                Nur in den Treffern
              </label>
            ) : null}
          </div>
          <div aria-live="polite" className="grid gap-2">
            {error ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="core-field-error" role="alert">{error}</p>
                <button type="button" className="core-body font-semibold text-core-action hover:underline" onClick={() => setAttempt((count) => count + 1)}>Erneut versuchen</button>
              </div>
            )
              : !result ? <p className="core-caption text-core-muted">Duplikate werden gesucht …</p>
                : <p className="core-body font-semibold text-core-text">{groups.length ? `${groups.length} ${groups.length === 1 ? "Gruppe" : "Gruppen"} · ${contentCount} Inhalte` : "Keine Duplikate"}</p>}
            {groups.length ? (
              <ul className="grid max-h-72 gap-2 overflow-y-auto rounded-inset border border-core-border p-2" data-testid="duplicate-groups">
                {groups.map((group) => (
                  <li key={group.contents[0].noteId} className="grid min-w-0 gap-0.5">
                    <p className="truncate core-caption font-semibold text-core-secondary">{group.text} · {group.contents.length}</p>
                    {group.contents.map((content) => (
                      <button key={content.noteId} type="button" className="flex min-h-8 min-w-0 items-baseline gap-2 rounded-inset px-1.5 text-left core-body text-core-text hover:bg-core-subtle" onClick={() => onOpen(content.deckId, content.cardIds[0])}>
                        <span className="min-w-0 flex-1 truncate">{content.preview}</span>
                        <span className="max-w-[40%] shrink-0 truncate core-caption text-core-muted">{deckName(content.deckId)}</span>
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
    />
  );
}
