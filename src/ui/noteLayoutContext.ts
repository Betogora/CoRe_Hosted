import React from "react";
import type { NoteTypeSource } from "../apkgNoteTranslation.ts";

/** Where cards find their imported template and deck name (ADR-047); without a provider every card shows the CoRe design. */
export interface NoteLayoutSource {
  loadNoteTypeSource(id: string): Promise<NoteTypeSource | null>;
  /** Full `::` path of a deck for the template fields `{{Deck}}` and `{{Subdeck}}`. */
  deckName(deckId: string): string;
}

export const NoteLayoutContext = React.createContext<NoteLayoutSource>({ loadNoteTypeSource: async () => null, deckName: () => "" });
