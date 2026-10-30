import { notePromptLabel, planNoteContentChange } from "../../coreModel.ts";
import type { Card, CardVariant, Note, NoteContent } from "../../coreTypes.ts";
import { stripHtml } from "../../htmlSafety.ts";
import { createCardTableRow } from "../../libraryModel.ts";
import { catalogEntryFromCard, type NoteGraph } from "../../workspaceReplica.ts";
import type { CardEditorTab } from "../../appNavigation.ts";

export const CARD_EDITOR_TAB_LABELS: Record<CardEditorTab, string> = {
  general: "Allgemein",
  content: "Inhalt",
  variants: "Varianten",
  study: "Lernen",
};

export type CardLabelOptions = { dayStartHour?: number; timeZone?: string };
export type NoteContentPlan = ReturnType<typeof planNoteContentChange>;

export function noteKindLabel(note: Pick<Note, "content">) {
  const interaction = note.content.interaction;
  if (interaction.kind === "cloze") return "Lückentext";
  if (interaction.kind === "image-occlusion") return "Bildverdeckung";
  if (interaction.kind === "choice") return interaction.mode === "single" ? "Single Choice" : interaction.mode === "multiple" ? "Multiple Choice" : "Kprim";
  return interaction.prompts.length > 1 ? "Frage und Antwort mit Rückrichtung" : "Frage und Antwort";
}

/** Learning state of a card in the words of the card list: new, suspended or reviewed with its next due date. */
export function cardStateLabel(card: Card, note: Note, options: CardLabelOptions) {
  if (card.status === "suspended") return "ausgesetzt";
  if (card.study.reps === 0) return "neu, ohne Lernstand";
  const { nextStudyLabel } = createCardTableRow(catalogEntryFromCard(card, note), options);
  return `${card.study.reps === 1 ? "1 Wiederholung" : `${card.study.reps} Wiederholungen`} · fällig ${nextStudyLabel}`;
}

/** Kind of the content and, with siblings, the card's position, e.g. „Lückentext · Lücke 2 von 3“. */
export function cardHeaderLabel(note: Note, card: Card, count: number) {
  if (count < 2) return noteKindLabel(note);
  const label = notePromptLabel(note.content, card.promptKey);
  const position = /^(cloze|io):\d+$/.test(card.promptKey) ? `${label} von ${count}` : `${label} · ${count} Karten aus diesem Inhalt`;
  return `${noteKindLabel(note)} · ${position}`;
}

/** Title of the editor: the plain question of the opened card's content. */
export function cardEditorTitle(note: Note) {
  const front = note.content.fields.find((field) => field.role === "prompt") ?? note.content.fields[0];
  return stripHtml(front?.html ?? "").replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, "$1").replace(/\s+/g, " ").trim() || "Karte ohne Fragetext";
}

export function removedCardsDescription(count: number) {
  return count === 1
    ? "Durch diese Änderung entfällt diese Karte samt ihrem Lernstand:"
    : `Durch diese Änderung entfallen ${count} Karten samt ihrem Lernstand:`;
}

export function outdatedVariantCount(graph: NoteGraph, plan: NoteContentPlan) {
  const activeBefore = new Set(graph.cards.flatMap((card) => card.variants.filter((variant) => variant.isActive && !variant.deletedAt).map((variant) => variant.id)));
  return plan.keptCards.flatMap((card) => card.variants).filter((variant) => variant.meta.outdated === true && activeBefore.has(variant.id)).length;
}

/** The effect of saving the draft, first in the footer (`Beim Speichern: …`), or null while only text changes. */
export function draftChangeSummary(graph: NoteGraph, plan: NoteContentPlan) {
  const parts: string[] = [];
  const labels = (cards: Card[], content: NoteContent) => cards.map((card) => notePromptLabel(content, card.promptKey)).join(", ");
  if (plan.newCards.length) parts.push(`${plan.newCards.length === 1 ? "1 neue Karte" : `${plan.newCards.length} neue Karten`} (${labels(plan.newCards, plan.note.content)})`);
  if (plan.removedCards.length) parts.push(`${plan.removedCards.length === 1 ? "1 Karte entfällt" : `${plan.removedCards.length} Karten entfallen`} (${labels(plan.removedCards, graph.note.content)})`);
  const outdated = outdatedVariantCount(graph, plan);
  if (outdated) parts.push(outdated === 1 ? "1 Variante wird veraltet" : `${outdated} Varianten werden veraltet`);
  return parts.length ? `Beim Speichern: ${parts.join(" · ")}.` : null;
}

export const VARIANT_STATE_TONE = {
  active: "bg-core-success-soft",
  off: "bg-core-subtle",
  reported: "bg-core-danger-soft",
  outdated: "bg-core-warning-soft",
  edited: "bg-core-info-soft",
} as const;

export interface VariantStateMark {
  label: string;
  tone: keyof typeof VARIANT_STATE_TONE;
}

/**
 * Marks of a variant: exactly one state (a report names its reason) plus `bearbeitet` for an own wording. Further
 * marks, such as P1's „nicht umformulierbar“, join this list (W17).
 */
export function variantStateMarks(variant: CardVariant, edited: boolean): { marks: VariantStateMark[]; reactivatable: boolean } {
  const state: VariantStateMark & { reactivatable: boolean } = variant.meta.outdated === true
    ? { label: "veraltet", tone: "outdated", reactivatable: false }
    : variant.qualityStatus === "flagged"
      ? { label: variant.feedback.at(-1)?.type === "unklar_formuliert" ? "gemeldet: unklar formuliert" : "gemeldet: inhaltlich falsch", tone: "reported", reactivatable: true }
      : variant.isActive && variant.qualityStatus === "active"
        ? { label: "aktiv", tone: "active", reactivatable: false }
        : { label: "abgeschaltet", tone: "off", reactivatable: true };
  return {
    marks: [{ label: state.label, tone: state.tone }, ...(edited ? [{ label: "bearbeitet", tone: "edited" as const }] : [])],
    reactivatable: state.reactivatable,
  };
}
