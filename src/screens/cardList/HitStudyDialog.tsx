import React from "react";
import type { HitStudyMode, HitStudyOrder } from "../../hitStudySession.ts";
import { ActionButton } from "../../ui/actionUi.tsx";
import { CoreSegmentedControl } from "../../ui/coreUi.tsx";
import { DialogFrame } from "../../ui/DialogFrame.tsx";
import { cardCount } from "./cardListModel.ts";

export interface HitStudyDialogProps {
  /** `Treffer lernen` or `Auswahl lernen`. */
  title: string;
  /** Ids of the cards to study, without suspended and buried ones. */
  loadCardIds: () => Promise<string[]>;
  onStart: (cardIds: string[], order: HitStudyOrder, mode: HitStudyMode) => Promise<void>;
  onClose: () => void;
}

/** Start dialog of `Treffer lernen` (KV5): names the cards, `Vorziehen` or `Nur üben` and the order. */
export function HitStudyDialog({ title, loadCardIds, onStart, onClose }: HitStudyDialogProps) {
  const [cardIds, setCardIds] = React.useState<string[] | null>(null);
  const [mode, setMode] = React.useState<HitStudyMode>("advance");
  const [order, setOrder] = React.useState<HitStudyOrder>("list");
  const [error, setError] = React.useState("");
  const [starting, setStarting] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    loadCardIds().then((ids) => active && setCardIds(ids), (failure: unknown) => active && setError(failure instanceof Error ? failure.message : "Die Karten konnten nicht geladen werden."));
    return () => {
      active = false;
    };
  }, [loadCardIds]);

  async function start() {
    if (!cardIds?.length) return;
    setStarting(true);
    setError("");
    try {
      await onStart(cardIds, order, mode);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Das Lernen konnte nicht starten.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <DialogFrame
      open
      title={title}
      size="s"
      onClose={onClose}
      footer={(
        <>
          <ActionButton variant="secondary" disabled={starting} onClick={onClose}>Abbrechen</ActionButton>
          <ActionButton variant="primary" loading={starting} disabled={starting} onClick={() => void start()}>Lernen</ActionButton>
        </>
      )}
    >
        <div className="grid gap-3" data-testid="hit-study-dialog">
          <p className="core-body font-semibold text-core-text" aria-live="polite">
            {cardIds === null ? "Karten werden gezählt …" : cardIds.length ? cardCount(cardIds.length) : "Keine Karte zum Lernen"}
          </p>
          <CoreSegmentedControl<HitStudyMode>
            ariaLabel="Lernweg"
            className="w-full"
            value={mode}
            options={[{ value: "advance", label: "Vorziehen" }, { value: "practice", label: "Nur üben" }]}
            onValueChange={setMode}
          />
          <CoreSegmentedControl<HitStudyOrder>
            ariaLabel="Reihenfolge"
            className="w-full"
            value={order}
            options={[{ value: "list", label: "Wie die Liste" }, { value: "shuffled", label: "Gemischt" }]}
            onValueChange={setOrder}
          />
          {error ? <p className="core-field-error" role="alert">{error}</p> : null}
        </div>
    </DialogFrame>
  );
}
