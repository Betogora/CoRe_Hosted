import type { SupabaseClient } from "@supabase/supabase-js";
import * as v from "valibot";
import { appRouteToUrl } from "./appNavigation.ts";
import { postAiRoute } from "./aiRouteRequest.ts";
import { collectDeckTreeIds } from "./coreWorkspace.ts";

import type { Deck, Note, NoteFieldRole } from "./coreTypes.ts";
import type { Database } from "./database.types.ts";
import type { TransientSourceDocument } from "./documentModel.ts";
import { SUMMARY_NOTES_HEADING, type SummaryGeneration } from "./learningSummaries.ts";
import { notePlainText } from "./notePresentation.ts";
import { escapeCardHtmlText } from "./richText.ts";
import type { SummarySettings } from "./learningSummarySettings.ts";
import {
  AI_LEARNING_SUMMARY_DEADLINE_MS, AI_LEARNING_SUMMARY_ENDPOINT, AiLearningSummaryError, MATERIAL_TOO_LARGE_MESSAGE, MAX_SUMMARY_REQUEST_BYTES, MAX_SUMMARY_UNITS,
  parseAiLearningSummaryRequest, parseAiLearningSummarySuccess,
  type AiLearningSummaryRequest, type AiLearningSummarySuccess, type GeneratedSummarySection, type SummaryMaterialUnit,
} from "./aiLearningSummaryContract.ts";

interface SummaryMaterialReference { id: string; label: string; href: string | null; }
export interface PreparedSummaryMaterial {
  request: AiLearningSummaryRequest;
  references: SummaryMaterialReference[];
  notices: string[];
}
export interface SummaryGenerationInput { deckId: string; title: string; settings: SummarySettings; source: TransientSourceDocument | null; }
export interface SummaryGenerationResult { html: string; generation: SummaryGeneration; }

export async function readSummarySourceFile(file: File): Promise<TransientSourceDocument> {
  if (file.size > 20 * 1_024 * 1_024) throw new AiLearningSummaryError("source_too_large", "Die Quelldatei ist zu groß. Wähle eine Datei bis 20 MiB.");
  const { createDocumentFromFile } = await import("./documentModel.ts");
  const document = await createDocumentFromFile(file);
  const pages = v.safeParse(v.array(v.looseObject({ textItemCount: v.number() })), document.metadata.pages);
  if (document.textExtractionStatus !== "success" || !document.text.trim() || (pages.success && !pages.output.some((page) => page.textItemCount > 0))) {
    throw new AiLearningSummaryError("unreadable_source", "Die Quelle enthält keinen lesbaren Text. Gescannten PDFs fehlt möglicherweise ein Textlayer.");
  }
  return document;
}

export type SummaryDeckLoader = (ids: string[], options: { signal?: AbortSignal; budget: (noteCount: number) => void }) => Promise<{ decks: Deck[]; notes: Note[] }>;

export async function generateLearningSummary(input: SummaryGenerationInput, loadDecks: SummaryDeckLoader, decks: Deck[], supabase: SupabaseClient<Database> | null, signal?: AbortSignal): Promise<SummaryGenerationResult> {
  const ids = summaryScopeDeckIds(decks, input.deckId, input.settings.scope);
  const budget = (noteCount: number) => { if (noteCount > MAX_SUMMARY_UNITS) throw new AiLearningSummaryError("material_too_large", MATERIAL_TOO_LARGE_MESSAGE); };
  const loaded = input.settings.material === "source" ? { decks, notes: [] } : await loadDecks(ids, { signal, budget });
  signal?.throwIfAborted();
  if (input.settings.material !== "source" && ids.some((id) => !loaded.decks.some((deck) => deck.id === id))) throw new AiLearningSummaryError("incomplete_material", "Der gewählte Bereich konnte nicht vollständig geladen werden.");
  const byId = new Map(loaded.decks.map((deck) => [deck.id, deck]));
  const all = decks.map((deck) => byId.get(deck.id) ?? deck);
  const material = prepareSummaryMaterial(all, loaded.notes, input.deckId, input.title, input.settings, input.source);
  const result = await requestAiLearningSummary(material.request, supabase, globalThis.fetch, signal);
  signal?.throwIfAborted();
  const references = new Map(material.references.map((ref) => [ref.id, ref]));
  return { html: generatedSummaryHtml(result, material), generation: {
    model: result.model, privacyMode: result.privacyMode, promptVersion: result.promptVersion,
    generatedAt: new Date().toISOString(), materialUnits: material.request.units.length,
    ...(result.summary.relations.length ? { relations: result.summary.relations } : {}),
    evidence: result.summary.sections.flatMap((section) => [section, ...section.subsections]).map((block) => ({ heading: block.heading, references: block.references.map((id) => {
      const reference = references.get(id)!;
      return { label: reference.label, href: reference.href };
    }) })),
  } };
}

export function summaryScopeDeckIds(decks: Deck[], deckId: string, scope: SummarySettings["scope"]): string[] {
  if (!decks.some((deck) => deck.id === deckId && !deck.deletedAt)) throw new AiLearningSummaryError("missing_deck", "Der Stapel ist nicht mehr verfügbar.");
  const ids = scope === "tree" ? collectDeckTreeIds(decks, deckId) : [deckId];
  const selected = new Set(ids);
  return decks.filter((deck) => selected.has(deck.id) && !deck.deletedAt).map((deck) => deck.id);
}

function cardText(value: string): string {
  return notePlainText(value).replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, "$1");
}

const FIELD_ROLE_LABELS: Record<Exclude<NoteFieldRole, "source">, string> = { prompt: "F", answer: "A", hint: "Hinweis", extra: "Zusatz", note: "Notiz" };

export function prepareSummaryMaterial(decks: Deck[], notes: Note[], deckId: string, title: string, settings: SummarySettings, source: TransientSourceDocument | null = null): PreparedSummaryMaterial {
  const ids = new Set(summaryScopeDeckIds(decks, deckId, settings.scope));
  const scoped = decks.filter((deck) => ids.has(deck.id));
  const deckKeys = new Map(scoped.map((deck, index) => [deck.id, `d${index + 1}`]));
  const units: SummaryMaterialUnit[] = [];
  const references: SummaryMaterialReference[] = [];
  const notices: string[] = [];
  const add = (kind: SummaryMaterialUnit["kind"], label: string, text: string, href: string | null, deck?: string) => {
    const id = `m${units.length + 1}`;
    units.push({ id, kind, ...(deck ? { deck } : {}), text }); references.push({ id, label, href });
  };
  if (settings.material !== "source") {
    const seen = new Set<string>();
    const notesById = new Map(notes.map((note) => [note.id, note]));
    let excludedImages = 0;
    for (const deck of scoped) {
      for (const card of deck.cards.filter((candidate) => !candidate.deletedAt)) {
        const note = notesById.get(card.noteId);
        if (!note || note.deletedAt) throw new AiLearningSummaryError("incomplete_material", "Ein Karteninhalt ist noch nicht vollständig geladen. Versuche es erneut, sobald die Inhalte verfügbar sind.");
        if (seen.has(note.id)) continue;
        seen.add(note.id);
        if (note.content.interaction.kind === "image-occlusion") { excludedImages += 1; continue; }
        const fieldTexts = note.content.fields.flatMap((field) => field.role === "source" ? [] : [{ role: field.role, text: cardText(field.html) }]).filter((field) => field.text);
        const interaction = note.content.interaction;
        const text = [
          ...fieldTexts.map((field) => `${FIELD_ROLE_LABELS[field.role]}: ${field.text}`),
          ...(interaction.kind === "choice" ? [
            "Richtig: " + interaction.options.filter((option) => option.correct).map((option) => cardText(option.html)).join("; "),
            "Falsch: " + interaction.options.filter((option) => !option.correct).map((option) => cardText(option.html)).join("; "),
          ] : []),
        ].join("\n").trim();
        if (!text) continue;
        add("card", deck.name + " · " + (fieldTexts[0]?.text || "Karte"), text, appRouteToUrl({ mode: "view", viewId: "kartenstapel", focusedDeckId: deck.id, selectedCardId: card.id }), deckKeys.get(deck.id));
      }
    }
    if (excludedImages) notices.push(`${excludedImages} ${excludedImages === 1 ? "Bildverdeckung wurde" : "Bildverdeckungen wurden"} nicht ausgewertet. Die Zusammenfassung berücksichtigt ausschließlich lesbaren Text.`);
  }
  if (settings.material !== "cards") {
    if (!source || source.textExtractionStatus !== "success" || !source.text.trim()) throw new AiLearningSummaryError("missing_source", "Füge für diese Grundlage eine Quelle mit lesbarem Text an.");
    const parsed = v.safeParse(v.array(v.looseObject({ pageNumber: v.number(), text: v.string(), textItemCount: v.number() })), source.metadata.pages);
    if (parsed.success) {
      const readable = parsed.output.filter((page) => page.textItemCount > 0 && page.text.trim());
      if (readable.length !== parsed.output.length) notices.push("Seiten ohne Textlayer wurden nicht ausgewertet. Für gescannte Seiten ist eine Texterkennung erforderlich.");
      for (const page of readable) add("source", `${source.fileName} · Seite ${page.pageNumber}`, page.text, null);
    } else add("source", source.fileName, source.text.trim(), null);
  }
  if (!units.length) throw new AiLearningSummaryError("empty_material", "Die Auswahl enthält keinen lesbaren Text für eine Zusammenfassung.");
  const deckEntries = units.some((unit) => unit.deck) ? scoped.map((deck) => {
    const parent = deck.parentDeckId ? deckKeys.get(deck.parentDeckId) : undefined;
    return { id: deckKeys.get(deck.id)!, name: deck.name, ...(parent ? { parent } : {}) };
  }) : [];
  const request = parseAiLearningSummaryRequest({ title, settings, decks: deckEntries, units });
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MAX_SUMMARY_REQUEST_BYTES) throw new AiLearningSummaryError("material_too_large", MATERIAL_TOO_LARGE_MESSAGE);
  return { request, references, notices };
}

export async function requestAiLearningSummary(input: AiLearningSummaryRequest, supabase: SupabaseClient<Database> | null, fetchImpl: typeof fetch = globalThis.fetch, signal?: AbortSignal): Promise<AiLearningSummarySuccess> {
  const request = parseAiLearningSummaryRequest(input);
  const body = await postAiRoute(AI_LEARNING_SUMMARY_ENDPOINT, request, supabase, {
    fetchImpl, signal, timeoutMs: AI_LEARNING_SUMMARY_DEADLINE_MS + 5_000,
    fail: (code, message) => new AiLearningSummaryError(code, message),
    messages: {
      timeout: "Die KI hat nicht rechtzeitig geantwortet. Versuche eine kürzere Fassung.",
      network: "Die Zusammenfassung konnte nicht angefordert werden. Prüfe deine Verbindung.",
      failed: "Die KI-Zusammenfassung konnte nicht erstellt werden.",
    },
  });
  return parseAiLearningSummarySuccess(body, request);
}

export function generatedSummaryHtml(result: AiLearningSummarySuccess, material: PreparedSummaryMaterial): string {
  parseAiLearningSummarySuccess(result, material.request);
  const references = new Map(material.references.map((ref) => [ref.id, ref]));
  const { format, showReferences } = material.request.settings;
  const point = (item: { keyword: string; text: string }) => `<strong>${escapeCardHtmlText(item.keyword)}</strong>: ${escapeCardHtmlText(item.text)}`;
  const paragraph = (text: string) => `<p>${escapeCardHtmlText(text)}</p>`;
  const list = (items: string[]) => items.length ? `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>` : "";
  const block = (item: Omit<GeneratedSummarySection, "subsections">, level: 2 | 3) => {
    const refs = showReferences ? item.references.map((id) => {
      const ref = references.get(id)!;
      return ref.href ? `<a href="${escapeCardHtmlText(ref.href)}">${escapeCardHtmlText(ref.label)}</a>` : escapeCardHtmlText(ref.label);
    }) : [];
    const content = format === "prose" ? [...item.paragraphs.map(paragraph), ...item.points.map((entry) => `<p>${point(entry)}</p>`)].join("")
      : format === "bullets" ? list([...item.paragraphs.map(escapeCardHtmlText), ...item.points.map(point)])
      : item.paragraphs.map(paragraph).join("") + list(item.points.map(point));
    return `${format === "prose" ? "" : `<h${level}>${escapeCardHtmlText(item.heading)}</h${level}>`}${content}${refs.length ? `<p><small>Grundlage: ${refs.join(" · ")}</small></p>` : ""}`;
  };
  const body = result.summary.sections.map((section) => block(section, 2) + section.subsections.map((subsection) => block(subsection, 3)).join("")).join("");
  const warnings = [...material.notices, ...result.summary.warnings];
  return `${body}${warnings.length ? `<h2>${SUMMARY_NOTES_HEADING}</h2>${warnings.map(paragraph).join("")}` : ""}`;
}
