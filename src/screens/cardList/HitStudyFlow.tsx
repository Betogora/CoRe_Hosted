import React from "react";
import type { Card, Note } from "../../coreTypes.ts";
import { orderHits, type HitStudyMode, type HitStudyOrder } from "../../hitStudySession.ts";
import type { AccountMediaStore } from "../../mediaStore.ts";
import { HitPractice } from "./HitPractice.tsx";
import { HitStudyDialog, type HitStudyDialogProps } from "./HitStudyDialog.tsx";

export interface HitStudyFlowProps extends Pick<HitStudyDialogProps, "title" | "practiceDeckName" | "loadCardIds" | "returnFocusRef"> {
  /** `Vorziehen`: a study session over these cards; only asked for without `practiceDeckName`. */
  onStudy?: (cardIds: string[], order: HitStudyOrder) => Promise<void>;
  /** The bodies of these cards; offline only those on this device. */
  loadPracticeCards: (cardIds: string[]) => Promise<Array<{ card: Card; note: Note }>>;
  mediaStore: AccountMediaStore | null;
  onClose: () => void;
}

/** `Treffer lernen` and `Alle Karten frei üben` (KV5): the start dialog, then the session or `Nur üben` in its place. */
export function HitStudyFlow({ onStudy, loadPracticeCards, mediaStore, onClose, ...dialog }: HitStudyFlowProps) {
  const [practiceBodies, setPracticeBodies] = React.useState<Array<{ card: Card; note: Note }> | null>(null);

  async function start(cardIds: string[], order: HitStudyOrder, mode: HitStudyMode) {
    if (mode === "advance") {
      await onStudy!(cardIds, order);
      onClose();
      return;
    }
    const bodies = await loadPracticeCards(cardIds);
    if (!bodies.length) throw new Error("Diese Karten sind erst online verfügbar.");
    setPracticeBodies(orderHits(bodies, order));
  }

  function closePractice() {
    dialog.returnFocusRef?.current?.focus();
    onClose();
  }

  return practiceBodies
    ? <HitPractice bodies={practiceBodies} mediaStore={mediaStore} onClose={closePractice} />
    : <HitStudyDialog {...dialog} onStart={start} onClose={onClose} />;
}
