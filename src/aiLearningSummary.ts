import type { SupabaseClient } from "@supabase/supabase-js";
import * as v from "valibot";
import { appRouteToUrl } from "./appNavigation.ts";
import { collectDeckTreeIds } from "./coreWorkspace.ts";

import type { Deck, Note } from "./coreTypes.ts";
import type { Database } from "./database.types.ts";
import type { TransientSourceDocument } from "./documentModel.ts";
import { summaryPlainText, type SummaryGeneration } from "./learningSummaries.ts";
import type { SummarySettings } from "./learningSummarySettings.ts";
import {
  AI_LEARNING_SUMMARY_ENDPOINT, AiLearningSummaryError, MAX_SUMMARY_REQUEST_BYTES,
  parseAiLearningSummaryRequest, parseAiLearningSummarySuccess,
  type AiLearningSummaryRequest, type AiLearningSummarySuccess, type SummaryMaterialUnit,
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

export async function generateLearningSummary(input: SummaryGenerationInput, loadDecks: (ids: string[]) => Promise<{ decks: Deck[]; notes: Note[] }>, decks: Deck[], supabase: SupabaseClient<Database> | null, signal?: AbortSignal): Promise<SummaryGenerationResult> {
  const ids = summaryScopeDeckIds(decks, input.deckId, input.settings.scope);
  const loaded = input.settings.material === "source" ? { decks, notes: [] } : await loadDecks(ids);
  signal?.throwIfAborted();
  if (input.settings.material !== "source" && ids.some((id) => !loaded.decks.some((deck) => deck.id === id))) throw new AiLearningSummaryError("incomplete_material", "Der gewählte Bereich konnte nicht vollständig geladen werden.");
  const byId = new Map(loaded.decks.map((deck) => [deck.id, deck]));
  const all = decks.map((deck) => byId.get(deck.id) ?? deck);
  const material = prepareSummaryMaterial(all, loaded.notes, input.deckId, input.title, input.settings, input.source);
  const result = await requestAiLearningSummary(material.request, supabase, globalThis.fetch, signal);
  signal?.throwIfAborted();
  return { html: generatedSummaryHtml(result, material), generation: {
    model: result.model, privacyMode: result.privacyMode, promptVersion: result.promptVersion,
    generatedAt: new Date().toISOString(), materialUnits: material.request.units.length,
    evidence: result.summary.sections.map((section) => ({ heading: section.heading, references: section.references.map((id) => {
      const reference = material.references.find((ref) => ref.id === id)!;
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
  return summaryPlainText(value).replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, "$1");
}

export function prepareSummaryMaterial(decks: Deck[], notes: Note[], deckId: string, title: string, settings: SummarySettings, source: TransientSourceDocument | null = null): PreparedSummaryMaterial {
  const ids = new Set(summaryScopeDeckIds(decks, deckId, settings.scope));
  const units: SummaryMaterialUnit[] = [];
  const references: SummaryMaterialReference[] = [];
  const notices: string[] = [];
  const add = (kind: SummaryMaterialUnit["kind"], label: string, text: string, href: string | null) => {
    const id = `m${units.length + 1}`;
    units.push({ id, kind, label: label.slice(0, 200), text }); references.push({ id, label, href });
  };
  if (settings.material !== "source") {
    const seen = new Set<string>();
    const notesById = new Map(notes.map((note) => [note.id, note]));
    let excludedImages = 0;
    for (const deck of decks.filter((candidate) => ids.has(candidate.id))) {
      for (const card of deck.cards.filter((candidate) => !candidate.deletedAt)) {
        const note = notesById.get(card.noteId);
        if (!note || note.deletedAt) throw new AiLearningSummaryError("incomplete_material", "Ein Karteninhalt ist noch nicht vollständig geladen. Versuche es erneut, sobald die Inhalte verfügbar sind.");
        if (seen.has(note.id)) continue;
        seen.add(note.id);
        if (note.content.interaction.kind === "image-occlusion") { excludedImages += 1; continue; }
        const fields = note.content.fields.filter((field) => field.role !== "source");
        const fieldTexts = fields.map((field) => ({ name: field.name, text: cardText(field.html) })).filter((field) => field.text);
        const interaction = note.content.interaction;
        const text = [
          ...fieldTexts.map((field) => field.name + ": " + field.text),
          ...(interaction.kind === "choice" ? [
            "Antwortoptionen: " + interaction.options.map((option) => cardText(option.html)).join("; "),
            "Richtige Antworten: " + interaction.options.filter((option) => option.correct).map((option) => cardText(option.html)).join("; "),
          ] : []),
        ].join("\n").trim();
        if (!text) continue;
        add("card", deck.name + " · " + (fieldTexts[0]?.text || "Karte"), text, appRouteToUrl({ mode: "view", viewId: "kartenstapel", focusedDeckId: deck.id, selectedCardId: card.id }));
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
  const request = parseAiLearningSummaryRequest({ title, settings, units });
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MAX_SUMMARY_REQUEST_BYTES) throw new AiLearningSummaryError("material_too_large", "Das Material ist zu umfangreich. Wähle einen kleineren Bereich.");
  return { request, references, notices };
}

export async function requestAiLearningSummary(input: AiLearningSummaryRequest, supabase: SupabaseClient<Database> | null, fetchImpl: typeof fetch = globalThis.fetch, signal?: AbortSignal): Promise<AiLearningSummarySuccess> {
  const request = parseAiLearningSummaryRequest(input);
  if (!supabase) throw new AiLearningSummaryError("auth_unavailable", "Die Anmeldung ist noch nicht bereit.");
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new AiLearningSummaryError("unauthorized", "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
  let response: Response;
  const timeout = AbortSignal.timeout(240_000);
  try {
    response = await fetchImpl(AI_LEARNING_SUMMARY_ENDPOINT, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(request), signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    if (signal?.aborted) throw new AiLearningSummaryError("cancelled", "Die Erstellung wurde abgebrochen.");
    if (timeout.aborted) throw new AiLearningSummaryError("provider_timeout", "Die KI hat nicht rechtzeitig geantwortet. Versuche eine kürzere Fassung.");
    throw new AiLearningSummaryError("network_error", "Die Zusammenfassung konnte nicht angefordert werden. Prüfe deine Verbindung.");
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new AiLearningSummaryError("invalid_response", "Die KI-Antwort konnte nicht gelesen werden."); }
  if (!response.ok) {
    const parsed = v.safeParse(v.looseObject({ error: v.looseObject({ code: v.string(), message: v.string() }) }), body);
    throw new AiLearningSummaryError(parsed.success ? parsed.output.error.code : "request_failed", parsed.success ? parsed.output.error.message : "Die KI-Zusammenfassung konnte nicht erstellt werden.");
  }
  return parseAiLearningSummarySuccess(body, request);
}

function escapeText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function generatedSummaryHtml(result: AiLearningSummarySuccess, material: PreparedSummaryMaterial): string {
  parseAiLearningSummarySuccess(result, material.request);
  const references = new Map(material.references.map((ref) => [ref.id, ref]));
  const format = material.request.settings.format;
  const body = result.summary.sections.map((section) => {
    const paragraphs = [...section.paragraphs, ...(format === "prose" ? section.points : [])];
    const points = format === "bullets" ? [...section.paragraphs, ...section.points] : format === "prose" ? [] : section.points;
    const refs = material.request.settings.showReferences ? section.references.map((id) => {
      const ref = references.get(id)!;
      return ref.href ? `<a href="${escapeText(ref.href)}">${escapeText(ref.label)}</a>` : escapeText(ref.label);
    }) : [];
    return `${format === "prose" ? "" : `<h2>${escapeText(section.heading)}</h2>`}${format === "bullets" ? "" : paragraphs.map((text) => `<p>${escapeText(text)}</p>`).join("")}${points.length ? `<ul>${points.map((text) => `<li>${escapeText(text)}</li>`).join("")}</ul>` : ""}${refs.length ? `<p><small>Grundlage: ${refs.join(" · ")}</small></p>` : ""}`;
  }).join("");
  const warnings = [...material.notices, ...result.summary.warnings];
  return `${body}${warnings.length ? `<h2>Hinweise zum Material</h2>${warnings.map((text) => `<p>${escapeText(text)}</p>`).join("")}` : ""}`;
}
