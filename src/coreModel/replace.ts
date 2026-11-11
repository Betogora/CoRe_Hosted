import type { Card, Note, NoteContent } from "../coreTypes.ts";
import { fieldSearchKey, planNoteContentChange } from "./notes.ts";
import { normalizeTags } from "./tags.ts";

/** Literal find and replace (KV5): in all fields, in the fields of one name, or in the tags. No regular expressions. */
export interface TextReplace {
  find: string;
  replace: string;
  /** `all` searches every field, `tags` the tags, any other value the fields with this name (as `Feld:` searches). */
  target: "all" | "tags" | { field: string };
  matchCase: boolean;
}

export interface TextReplacePreview {
  noteId: string;
  /** Field name, or `Tags`. */
  place: string;
  before: string;
  after: string;
}

interface Graph {
  note: Note;
  cards: Card[];
}

const SNIPPET_CONTEXT = 32;
const ENTITY = /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi;
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0" };

function decode(text: string) {
  return text.replace(ENTITY, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in NAMED) return NAMED[lower];
    const code = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : `&${entity};`;
  });
}

const encode = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\u00a0/g, "&nbsp;");

function pattern(edit: TextReplace) {
  return new RegExp(edit.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), edit.matchCase ? "gu" : "giu");
}

/** Replaces in the text between HTML tags only, so markup and attributes stay intact; untouched text keeps its entities. */
function replaceInHtml(html: string, find: RegExp, replacement: string) {
  return html.split(/(<[^>]*>)/).map((part, index) => {
    if (index % 2 === 1) return part;
    const text = decode(part);
    find.lastIndex = 0;
    if (!find.test(text)) return part;
    return encode(text.replace(find, () => replacement));
  }).join("");
}

const plain = (html: string) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

function snippets(before: string, after: string, find: RegExp, span: number) {
  find.lastIndex = 0;
  const at = find.exec(before)?.index ?? 0;
  // The first change starts at the same place in both texts, so both snippets show the same surrounding.
  const start = Math.max(0, at - SNIPPET_CONTEXT);
  const length = SNIPPET_CONTEXT * 2 + span;
  const cut = (text: string) => `${start ? "…" : ""}${text.slice(start, start + length)}${start + length < text.length ? "…" : ""}`;
  return { before: cut(before), after: cut(after) };
}

/** The content after the replacement and its first change; the same content and no snippet when nothing matched. */
export function replaceInNoteContent(content: NoteContent, edit: TextReplace): { content: NoteContent; snippet: Omit<TextReplacePreview, "noteId"> | null } {
  if (!edit.find) return { content, snippet: null };
  const find = pattern(edit);
  const span = Math.max(edit.find.length, edit.replace.length);
  if (edit.target === "tags") {
    const tags = normalizeTags(content.tags.map((tag) => tag.replace(find, () => edit.replace)));
    if (JSON.stringify(tags) === JSON.stringify(content.tags)) return { content, snippet: null };
    return { content: { ...content, tags }, snippet: { place: "Tags", ...snippets(content.tags.join(" "), tags.join(" "), find, span) } };
  }
  const fieldKey = typeof edit.target === "object" ? fieldSearchKey(edit.target.field) : null;
  let snippet: Omit<TextReplacePreview, "noteId"> | null = null;
  const fields = content.fields.map((field) => {
    if (fieldKey !== null && fieldSearchKey(field.name) !== fieldKey) return field;
    const html = replaceInHtml(field.html, find, edit.replace);
    if (html === field.html) return field;
    snippet ??= { place: field.name, ...snippets(plain(field.html), plain(html), find, span) };
    return { ...field, html };
  });
  return snippet ? { content: { ...content, fields }, snippet } : { content, snippet };
}

/**
 * Plans the replacement in the contents of the selected cards. A content changes as a local edit through
 * `planNoteContentChange`, so its `contentRevision` rises and the variants of changed prompts become outdated. Contents
 * whose cards would change (a new or lost cloze, an invalid content) stay untouched and count as skipped.
 */
export function planTextReplace(graphs: readonly Graph[], cardIds: ReadonlySet<string>, edit: TextReplace, updatedAt = new Date().toISOString()) {
  const changes: Array<{ previous: Graph; next: Graph }> = [];
  const changedCardIds: string[] = [];
  const skippedCardIds: string[] = [];
  const previews: TextReplacePreview[] = [];
  for (const graph of graphs) {
    const selected = graph.cards.filter((card) => cardIds.has(card.id)).map((card) => card.id);
    if (!selected.length || graph.note.deletedAt) continue;
    const replaced = replaceInNoteContent(graph.note.content, edit);
    if (!replaced.snippet) continue;
    // An invalid content after the replacement counts as skipped.
    const plan = (() => {
      try {
        return planNoteContentChange(graph, replaced.content, updatedAt);
      } catch {
        return null;
      }
    })();
    if (!plan || plan.newCards.length || plan.removedCards.length) {
      skippedCardIds.push(...selected);
      continue;
    }
    if (!plan.changed) continue;
    changes.push({ previous: graph, next: { note: plan.note, cards: plan.keptCards } });
    changedCardIds.push(...selected);
    previews.push({ noteId: graph.note.id, ...replaced.snippet });
  }
  return { changes, changedCardIds, skippedCardIds, previews };
}

/**
 * Takes a replacement back: a content gets its earlier text while it still holds the text the replacement saved; one
 * edited since keeps the later text and counts as skipped.
 */
export function planTextReplaceUndo(current: readonly Graph[], replaced: ReadonlyArray<{ previous: Graph; next: Graph }>, cardIds: ReadonlySet<string>, updatedAt = new Date().toISOString()) {
  const byNote = new Map(replaced.map((change) => [change.next.note.id, change]));
  const changes: Array<{ previous: Graph; next: Graph }> = [];
  const changedCardIds: string[] = [];
  const skippedCardIds: string[] = [];
  for (const graph of current) {
    const change = byNote.get(graph.note.id);
    if (!change) continue;
    const { previous } = change;
    const selected = graph.cards.filter((card) => cardIds.has(card.id)).map((card) => card.id);
    if (graph.note.deletedAt || JSON.stringify(graph.note.content) !== JSON.stringify(change.next.note.content)) {
      skippedCardIds.push(...selected);
      continue;
    }
    const plan = planNoteContentChange(graph, previous.note.content, updatedAt);
    if (!plan.changed) continue;
    changes.push({ previous: graph, next: { note: plan.note, cards: plan.keptCards } });
    changedCardIds.push(...selected);
  }
  return { changes, changedCardIds, skippedCardIds };
}
