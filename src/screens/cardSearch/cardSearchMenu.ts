import { cardSearchConflicts, cardSearchGroupMembers } from "./cardSearchExpression.ts";
import { Activity, CalendarClock, CalendarRange, Flag, Gauge, Layers, Sparkles, Tag, TextCursorInput, CircleHelp, type LucideIcon } from "lucide-react";
import { flagName } from "../../ui/flagUi.tsx";
import type { Deck } from "../../coreTypes.ts";
import type { TagDirectoryEntry } from "../../tagDirectory.ts";
import { createDeckLibraryModel } from "../../libraryModel.ts";

export interface CardSearchMenuItem {
  label: string;
  /** The cards the term finds as a plural phrase (`überfällige Karten`); the switch's tooltips name it. */
  description: string;
  term: string;
  depth?: number;
  flag?: number;
  hideTerm?: boolean;
}

export interface CardSearchMenuCategory {
  id: "heute" | "status" | "flaggen" | "stapel" | "tags" | "inhalt" | "zeitraum" | "werte" | "felder" | "syntax";
  label: string;
  icon: LucideIcon;
  items: CardSearchMenuItem[];
}

const CONTENT_FORMS = [
  { label: "Frage–Antwort", description: "Frage–Antwort-Karten", term: "is:reveal" },
  { label: "Auswahl", description: "Auswahlkarten", term: "is:choice" },
  { label: "Lückentext", description: "Lückentextkarten", term: "is:cloze" },
  { label: "Bildverdeckung", description: "Bildverdeckungskarten", term: "is:occlusion" },
] as const;

/** `term(n)` covers today and the n - 1 days before. */
export const CARD_SEARCH_SINCE_OPTIONS = [
  { value: "rated", label: "Gelernt", term: (days: number) => `rated:${days}` },
  { value: "again", label: "Nochmal", term: (days: number) => `rated:${days}:1` },
  { value: "hard", label: "Schwer", term: (days: number) => `rated:${days}:2` },
  { value: "good", label: "Gut", term: (days: number) => `rated:${days}:3` },
  { value: "easy", label: "Leicht", term: (days: number) => `rated:${days}:4` },
  { value: "introduced", label: "Erstmals gelernt", term: (days: number) => `introduced:${days}` },
  { value: "added", label: "Hinzugefügt", term: (days: number) => `added:${days}` },
  { value: "edited", label: "Bearbeitet", term: (days: number) => `edited:${days}` },
  { value: "resched", label: "Neu geplant", term: (days: number) => `resched:${days}` },
] as const;

/** Interval and difficulty only exist for cards that are not new. */
export const CARD_SEARCH_PROP_OPTIONS = [
  { value: "ivl", label: "Intervall", unit: "Tage" },
  { value: "s", label: "Haltbarkeit", unit: "Tage" },
  { value: "d", label: "Schwierigkeit", unit: "" },
  { value: "reps", label: "Wiederholungen", unit: "" },
  { value: "lapses", label: "Fehler", unit: "" },
] as const;

export const CARD_SEARCH_OPERATORS = [
  { value: "<", label: "<" },
  { value: "<=", label: "≤" },
  { value: "=", label: "=" },
  { value: "!=", label: "≠" },
  { value: ">=", label: "≥" },
  { value: ">", label: ">" },
] as const;

function writtenTermLabel(bare: string): { label: string; category: string } | null {
  const since = /^(rated|introduced|added|edited|resched):(\d+)(?::([1-4]))?$/.exec(bare);
  if (since) {
    // `rated:n:1` to `4` are the options after `rated`, in rating order.
    const option = since[3] ? CARD_SEARCH_SINCE_OPTIONS[Number(since[3])] : CARD_SEARCH_SINCE_OPTIONS.find((candidate) => candidate.value === since[1])!;
    const days = Number(since[2]);
    return { label: `${option.label}, ${days === 1 ? "heute" : `letzte ${days} Tage`}`, category: "Zeitraum" };
  }
  const prop = /^prop:(ivl|d|s|reps|lapses)(<=|>=|!=|<|>|=)(.+)$/.exec(bare);
  if (prop) {
    const option = CARD_SEARCH_PROP_OPTIONS.find((candidate) => candidate.value === prop[1])!;
    const operator = CARD_SEARCH_OPERATORS.find((candidate) => candidate.value === prop[2])!;
    const unit = option.unit && (prop[3] === "1" ? " Tag" : ` ${option.unit}`);
    return { label: `${option.label} ${operator.label} ${prop[3].replace(".", ",")}${unit}`, category: "Werte" };
  }
  return null;
}

export function createCardSearchMenu({ decks, tags, flagNames, noteTypes = [] }: {
  decks: Deck[];
  tags: readonly TagDirectoryEntry[];
  flagNames: readonly string[];
  /** Anki note types; one row per name (`note:`, spaces as `_`), since several imports bring the same type. */
  noteTypes?: readonly { id: string; name: string }[];
}): CardSearchMenuCategory[] {
  const deckRows = createDeckLibraryModel(decks).rows;
  return [
    { id: "heute", label: "Heute", icon: CalendarClock, items: [
      { label: "Fällig", description: "heute fällige Karten", term: "is:due" },
      { label: "Überfällig", description: "überfällige Karten", term: "prop:due<0" },
      { label: "Morgen fällig", description: "morgen fällige Karten", term: "prop:due=1" },
      { label: "Gelernt", description: "heute gelernte Karten", term: "rated:1" },
      { label: "Nochmal", description: "heute mit Nochmal beantwortete Karten", term: "rated:1:1" },
      { label: "Erstmals gelernt", description: "heute erstmals gelernte Karten", term: "introduced:1" },
      { label: "Hinzugefügt", description: "heute hinzugefügte Karten", term: "added:1" },
      { label: "Bearbeitet", description: "heute bearbeitete Karten", term: "edited:1" },
      { label: "Neu geplant", description: "heute neu geplante Karten", term: "resched:1" },
    ] },
    { id: "status", label: "Kartenstatus", icon: Activity, items: [
      { label: "Neu", description: "noch nie gelernte Karten", term: "is:new" },
      { label: "Lernen", description: "Karten in der Lern- oder Wiederlernphase", term: "is:learn" },
      { label: "Jung", description: "junge Karten mit weniger als 21 Tagen Haltbarkeit", term: "is:young" },
      { label: "Reif", description: "reife Karten mit mindestens 21 Tagen Haltbarkeit", term: "is:mature" },
      { label: "Ausgesetzt", description: "ausgesetzte Karten", term: "is:suspended" },
      { label: "Manuell zurückgestellt", description: "heute manuell zurückgestellte Karten", term: "is:buried" },
      { label: "Lernbremse", description: "Karten mit Lernbremse", term: "tag:leech" },
      { label: "Markiert", description: "markierte Karten", term: "tag:marked" },
    ] },
    { id: "flaggen", label: "Flaggen", icon: Flag, items: [
      ...[1, 2, 3, 4, 5, 6, 7].map((flag) => ({ label: flagName(flag, flagNames), description: `Karten mit der Flagge „${flagName(flag, flagNames)}“`, term: `flag:${flag}`, flag })),
      { label: "Ohne Flagge", description: "Karten ohne Flagge", term: "flag:0" },
    ] },
    { id: "stapel", label: "Stapel", icon: Layers, items: deckRows.map((row) => ({ label: row.deck.name, description: `Karten im Stapel „${row.deck.name}“ samt Unterstapeln`, term: `did:${row.id}`, depth: row.depth, hideTerm: true })) },
    { id: "tags", label: "Tags", icon: Tag, items: [
      ...[...tags].sort((left, right) => left.tag.localeCompare(right.tag, "de")).map((entry) => {
        const parts = entry.tag.split("::");
        return { label: parts.at(-1) ?? entry.tag, description: `Karten mit dem Tag „${entry.tag}“ samt Untertags`, term: `tag:${entry.tag}`, depth: parts.length - 1 };
      }),
      { label: "Ohne Tags", description: "Karten ohne Tags", term: "tag:none" },
    ] },
    { id: "inhalt", label: "Inhalt", icon: Sparkles, items: [
      { label: "Variante", description: "Karten mit Variante", term: "has:variant" },
      { label: "Veraltete Variante", description: "Karten mit veralteter Variante", term: "has:outdated" },
      ...CONTENT_FORMS,
      { label: "Abfrage 1 (vorwärts)", description: "Karten der ersten Abfrage ihrer Notiz", term: "card:1" },
      { label: "Abfrage 2 (rückwärts)", description: "Karten der zweiten Abfrage ihrer Notiz", term: "card:2" },
      ...[...new Set(noteTypes.map((noteType) => noteType.name))].map((name) => ({ label: `Notiztyp ${name}`, description: `Karten des Notiztyps „${name}“`, term:`note:${name.replace(/\s+/g, "_")}` })),
    ] },
    { id: "zeitraum", label: "Zeitraum", icon: CalendarRange, items: [] },
    { id: "werte", label: "Werte", icon: Gauge, items: [] },
    { id: "felder", label: "Felder", icon: TextCursorInput, items: [] },
    { id: "syntax", label: "Gespeichert & Syntax", icon: CircleHelp, items: [] },
  ];
}

/** Hint for a search no card can meet, naming the filters that contradict each other; null for any other search. */
export function cardSearchConflictMessage(query: string, categories: readonly CardSearchMenuCategory[]): string | null {
  // Each filter names its category, once at the end when all share one: „Neu“ und „Reif“ (Kartenstatus).
  const conflicts = cardSearchConflicts(query).map((sources) => {
    const labels = sources.map((source) => cardSearchTermLabel(source, categories));
    const shared = labels.every((entry) => entry.category === labels[0].category) ? labels[0].category : undefined;
    const names = labels.map(({ label, category, negated }) => `„${negated ? `ohne ${label}` : label}“${category && shared === undefined ? ` (${category})` : ""}`);
    return `${names.slice(0, -1).join(", ")} und ${names.at(-1)}${shared ? ` (${shared})` : ""} schließen sich aus.`;
  });
  return conflicts.length ? `So passt keine Karte: ${conflicts.join(" ")}` : null;
}

/** Readable chip label of a term; the menu's own label where it has one, otherwise the term as written. */
export function cardSearchTermLabel(term: string, categories: readonly CardSearchMenuCategory[]): { label: string; category: string | null; negated: boolean } {
  const group = cardSearchGroupMembers(term);
  if (group) {
    const members = group.members.map((member) => cardSearchTermLabel(member, categories));
    return { label: members.map((member) => member.label).join(" oder "), category: members[0]?.category ?? null, negated: group.negated };
  }
  const negated = term.startsWith("-");
  const bare = (negated ? term.slice(1) : term).toLocaleLowerCase("und");
  for (const category of categories) {
    const item = category.items.find((candidate) => candidate.term.toLocaleLowerCase("und") === bare);
    if (item) return { label: category.id === "tags" ? item.term.slice("tag:".length) : item.label, category: category.label, negated };
  }
  const written = writtenTermLabel(bare);
  if (written) return { ...written, negated };
  return { label: negated ? term.slice(1) : term, category: null, negated };
}
