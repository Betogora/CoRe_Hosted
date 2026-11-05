import { Activity, CalendarClock, Flag, Layers, Sparkles, Tag, TextCursorInput, CircleHelp, type LucideIcon } from "lucide-react";
import { flagName } from "../../ui/flagUi.tsx";
import type { Deck } from "../../coreTypes.ts";
import type { TagDirectoryEntry } from "../../tagDirectory.ts";
import { createDeckLibraryModel } from "../../libraryModel.ts";

/** One row of the advanced search: a label and the search term it switches between `Mit`, `Egal` and `Ohne`. */
export interface CardSearchMenuItem {
  label: string;
  term: string;
  depth?: number;
  flag?: number;
  /** Deck ids say nothing to learners; the row shows the name only. */
  hideTerm?: boolean;
}

export interface CardSearchMenuCategory {
  id: "heute" | "status" | "flaggen" | "stapel" | "tags" | "inhalt" | "felder" | "syntax";
  label: string;
  icon: LucideIcon;
  items: CardSearchMenuItem[];
}

/** Categories of the advanced search (ADR-048, KV2): Anki's browser sidebar as filters with three positions. */
export function createCardSearchMenu({ decks, tags, flagNames }: { decks: Deck[]; tags: readonly TagDirectoryEntry[]; flagNames: readonly string[] }): CardSearchMenuCategory[] {
  const deckRows = createDeckLibraryModel(decks).rows;
  return [
    { id: "heute", label: "Heute", icon: CalendarClock, items: [
      { label: "Fällig", term: "is:due" },
      { label: "Überfällig", term: "prop:due<0" },
      { label: "Morgen fällig", term: "prop:due=1" },
    ] },
    { id: "status", label: "Kartenstatus", icon: Activity, items: [
      { label: "Neu", term: "is:new" },
      { label: "Lernen", term: "is:learn" },
      { label: "Jung", term: "is:young" },
      { label: "Reif", term: "is:mature" },
      { label: "Ausgesetzt", term: "is:suspended" },
      { label: "Lernbremse", term: "tag:leech" },
      { label: "Markiert", term: "tag:marked" },
    ] },
    { id: "flaggen", label: "Flaggen", icon: Flag, items: [
      ...[1, 2, 3, 4, 5, 6, 7].map((flag) => ({ label: flagName(flag, flagNames), term: `flag:${flag}`, flag })),
      { label: "Ohne Flagge", term: "flag:0" },
    ] },
    { id: "stapel", label: "Stapel", icon: Layers, items: deckRows.map((row) => ({ label: row.deck.name, term: `did:${row.id}`, depth: row.depth, hideTerm: true })) },
    { id: "tags", label: "Tags", icon: Tag, items: [
      ...[...tags].sort((left, right) => left.tag.localeCompare(right.tag, "de")).map((entry) => {
        const parts = entry.tag.split("::");
        return { label: parts.at(-1) ?? entry.tag, term: `tag:${entry.tag}`, depth: parts.length - 1 };
      }),
      { label: "Ohne Tags", term: "tag:none" },
    ] },
    { id: "inhalt", label: "Inhalt", icon: Sparkles, items: [{ label: "Variante", term: "has:variant" }] },
    { id: "felder", label: "Felder", icon: TextCursorInput, items: [] },
    { id: "syntax", label: "Suchsyntax", icon: CircleHelp, items: [] },
  ];
}

/** Readable chip label of a term; the menu's own label where it has one, otherwise the term as written. */
export function cardSearchTermLabel(term: string, categories: readonly CardSearchMenuCategory[]): { label: string; category: string | null; negated: boolean } {
  const negated = term.startsWith("-");
  const bare = (negated ? term.slice(1) : term).toLocaleLowerCase("und");
  for (const category of categories) {
    const item = category.items.find((candidate) => candidate.term.toLocaleLowerCase("und") === bare);
    if (item) return { label: category.id === "tags" ? item.term.slice("tag:".length) : item.label, category: category.label, negated };
  }
  return { label: negated ? term.slice(1) : term, category: null, negated };
}
