import React from "react";
import type { CardBatchAction, TextReplaceSession } from "../../cardBatchActions.ts";
import type { TextReplace } from "../../coreModel.ts";
import { ActionButton } from "../../ui/actionUi.tsx";
import { DialogFrame } from "../../ui/DialogFrame.tsx";
import { CoreCheckbox } from "../../ui/formControls.tsx";
import { CoreSelect } from "../../ui/selectUi.tsx";
import { cardCount } from "./cardListModel.ts";

const LABEL = "Suchen und Ersetzen";
const FIELD_PREFIX = "field:";

export interface TextReplaceDialogProps {
  /** Selected cards. */
  count: number;
  /** Loads the selected contents for their fields and the preview. */
  prepare: () => Promise<TextReplaceSession>;
  onRun: (action: CardBatchAction, done: (cards: string) => string) => Promise<void>;
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
      await onRun({ kind: "replace", ...edit }, (cards) => `Text in ${cards} ersetzt`);
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
    <DialogFrame
      open
      title={LABEL}
      size="s"
      onClose={onClose}
      footer={(
        <>
          <ActionButton variant="secondary" disabled={running} onClick={onClose}>Abbrechen</ActionButton>
          <ActionButton variant="primary" loading={running} disabled={running} onClick={() => void confirm()}>Ersetzen</ActionButton>
        </>
      )}
    >
        <div className="grid gap-4" data-testid="text-replace-dialog">
          <p className="core-body text-core-secondary">Wörtlicher Text in den Inhalten von <strong className="font-semibold text-core-text">{cardCount(count)}</strong>, nie Formatierung oder Links.</p>
          <div className="grid gap-3">
            <label className="core-field-group min-w-0"><span className="core-field-label">Suchen</span>
              <input className="core-field w-full" value={find} autoFocus onChange={(event) => setFind(event.target.value)} />
            </label>
            <label className="core-field-group min-w-0"><span className="core-field-label">Ersetzen durch</span>
              <input className="core-field w-full" value={replace} onChange={(event) => setReplace(event.target.value)} />
            </label>
          </div>
          <div className="core-field-group min-w-0"><span className="core-field-label" aria-hidden="true">Suchen in</span>
            <CoreSelect ariaLabel="Suchen in" className="w-full" value={target} options={options} onValueChange={setTarget} />
          </div>
          <CoreCheckbox label="Groß-/Kleinschreibung beachten" checked={matchCase} onCheckedChange={setMatchCase} />
          <div aria-live="polite" className="grid gap-2" data-testid="text-replace-preview">
            {loadError ? <p className="core-field-error" role="alert">{loadError}</p>
              : !session ? <p className="core-caption text-core-muted">Inhalte werden geladen …</p>
                : preview ? (
                  <>
                    <p className="core-body font-semibold text-core-text">{preview.changedCount ? `${cardCount(preview.changedCount)} ${preview.changedCount === 1 ? "ändert" : "ändern"} sich` : "Keine Treffer"}</p>
                    {preview.skippedCount ? <p className="core-caption text-core-muted">{cardCount(preview.skippedCount)} {preview.skippedCount === 1 ? "bleibt" : "bleiben"} unverändert, weil sich sonst ihre Karten ändern würden.</p> : null}
                    {preview.examples.length ? (
                      <ul className="grid gap-1.5">
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
    </DialogFrame>
  );
}
