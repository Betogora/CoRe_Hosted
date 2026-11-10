import React from "react";
import type { CardBatchAction, TextReplaceSession } from "../../cardBatchActions.ts";
import type { TextReplace } from "../../coreModel.ts";
import { ActionDialog } from "../../ui/coreUi.tsx";
import { CoreSelect } from "../../ui/selectUi.tsx";
import { cardCount } from "./cardListModel.ts";

const LABEL = "Suchen und Ersetzen";
const FIELD_PREFIX = "field:";

export interface TextReplaceDialogProps {
  /** Selected cards. */
  count: number;
  /** Loads the selected contents for their fields and the preview. */
  prepare: () => Promise<TextReplaceSession>;
  onRun: (action: CardBatchAction, label: string) => Promise<void>;
  onClose: () => void;
}

/** `Suchen und Ersetzen` of the card management (KV5): literal text, in all fields, one field or the tags, with a preview. */
export function TextReplaceDialog({ count, prepare, onRun, onClose }: TextReplaceDialogProps) {
  const [session, setSession] = React.useState<TextReplaceSession | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [find, setFind] = React.useState("");
  const [replace, setReplace] = React.useState("");
  const [target, setTarget] = React.useState("all");
  const [matchCase, setMatchCase] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    prepare().then((loaded) => active && setSession(loaded), (error: unknown) => active && setLoadError(error instanceof Error ? error.message : "Die Inhalte konnten nicht geladen werden."));
    return () => {
      active = false;
    };
  }, [prepare]);

  const edit = React.useMemo<TextReplace>(() => ({
    find,
    replace,
    target: target === "all" || target === "tags" ? target : { field: target.slice(FIELD_PREFIX.length) },
    matchCase,
  }), [find, replace, target, matchCase]);
  const deferredEdit = React.useDeferredValue(edit);
  const preview = React.useMemo(() => session && deferredEdit.find ? session.preview(deferredEdit) : null, [session, deferredEdit]);

  async function confirm() {
    if (!edit.find || !preview?.changedCount) return;
    setRunning(true);
    try {
      await onRun({ kind: "replace", ...edit }, LABEL);
      onClose();
    } finally {
      setRunning(false);
    }
  }

  const options = [
    { value: "all", label: "Alle Felder" },
    ...(session?.fieldNames ?? []).map((name) => ({ value: `${FIELD_PREFIX}${name}`, label: name })),
    { value: "tags", label: "Tags" },
  ];

  return (
    <ActionDialog
      open
      title={`${LABEL}: ${cardCount(count)}`}
      confirmLabel="Ersetzen"
      cancelLabel="Abbrechen"
      confirmLoading={running}
      onCancel={onClose}
      onConfirm={() => void confirm()}
      description={(
        <div className="grid gap-3" data-testid="text-replace-dialog">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="core-field-group min-w-0"><span className="core-field-label">Suchen</span>
              <input className="core-field w-full" value={find} autoFocus onChange={(event) => setFind(event.target.value)} />
            </label>
            <label className="core-field-group min-w-0"><span className="core-field-label">Ersetzen durch</span>
              <input className="core-field w-full" value={replace} onChange={(event) => setReplace(event.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <CoreSelect ariaLabel="Suchen in" className="min-w-40" value={target} options={options} onValueChange={setTarget} />
            <label className="flex items-center gap-2 core-body text-core-text">
              <input type="checkbox" className="size-5 shrink-0 accent-core-action" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} />
              Groß-/Kleinschreibung beachten
            </label>
          </div>
          <div aria-live="polite" className="grid gap-2" data-testid="text-replace-preview">
            {loadError ? <p className="core-field-error" role="alert">{loadError}</p>
              : !session ? <p className="core-caption text-core-muted">Inhalte werden geladen …</p>
                : preview ? (
                  <>
                    <p className="core-body font-semibold text-core-text">{preview.changedCount ? `${cardCount(preview.changedCount)} ${preview.changedCount === 1 ? "ändert" : "ändern"} sich` : "Keine Treffer"}</p>
                    {preview.skippedCount ? <p className="core-caption text-core-muted">{cardCount(preview.skippedCount)} {preview.skippedCount === 1 ? "bleibt" : "bleiben"} unverändert, weil sich sonst ihre Karten ändern würden.</p> : null}
                    {preview.examples.length ? (
                      <ul className="grid max-h-56 gap-1.5 overflow-y-auto rounded-inset border border-core-border p-2">
                        {preview.examples.map((example) => (
                          <li key={example.noteId} className="grid min-w-0 gap-0.5 core-caption">
                            <span className="font-semibold text-core-secondary">{example.place}</span>
                            <span className="truncate text-core-muted line-through">{example.before}</span>
                            <span className="truncate text-core-text">{example.after}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : null}
          </div>
        </div>
      )}
    />
  );
}
