import type { SupabaseClient } from "@supabase/supabase-js";
import * as v from "valibot";
import { postAiRoute } from "./aiRouteRequest.ts";
import {
  AI_SOURCE_CARDS_DEADLINE_MS, AI_SOURCE_CARDS_ENDPOINT, AiSourceCardsError, MAX_SOURCE_PORTION_CHARS, MAX_SOURCE_PORTION_UNITS,
  parseAiSourceCardsRequest, parseAiSourceCardsSuccess,
  type AiSourceCardsRequest, type GeneratedSourceCard, type GeneratedSourceCards,
} from "./aiSourceCardsContract.ts";
import { MAX_AI_SOURCE_CARDS, MAX_AI_SOURCE_CHARS, aiSourceFileError, type AiSourceCreationDraft } from "./aiSourceCreation.ts";
import { createManualNoteContent, type ManualNoteInput } from "./coreModel.ts";
import type { Deck, NoteContent } from "./coreTypes.ts";
import type { Database } from "./database.types.ts";
import type { TransientSourceDocument } from "./documentModel.ts";
import { escapeCardHtmlText } from "./richText.ts";

/** Size of one source unit; small enough that a proposal names a findable place, large enough to keep context. */
const MAX_UNIT_CHARS = 4_000;
const MAX_HEADING_CHARS = 80;
/** A paragraph shorter than this joins the next one, so a proposal still names a findable, but not tiny place. */
const MIN_PARAGRAPH_CHARS = 300;
/** Text without blank lines (pasted from word processors) still ends a place at a line break after this size. */
const MAX_LINE_BLOCK_CHARS = 1_200;
/** Rows of a table file that form one place. */
const TABLE_ROWS_PER_UNIT = 10;

/** Errors every further portion would hit the same way; the run stops instead of repeating them (as the variant batch does). */
const STOPPING_ERROR_CODES = new Set([
  "unauthorized", "auth_unavailable", "network_error", "missing_openrouter_api_key", "openrouter_auth_failed",
  "provider_budget_exhausted", "rate_limited", "no_provider_endpoint",
]);

/** A findable place of the source and its text; the run numbers the units of each request. */
export interface SourceUnit { label: string; text: string; }
interface ReadSource { units: SourceUnit[]; notices: string[]; }
export interface SourceCardProposal extends GeneratedSourceCard { id: string; sourceLabels: string[]; }
/** An unsaved proposal as it would be stored; editing replaces its content. */
export interface ProposalDraft { id: string; content: NoteContent; }
type SaveProposal = (input: { deckId: string | null; deckName: string; content: NoteContent; media: Record<string, string> }) => Promise<{ deck: { id: string }; cardIds: string[] } | null>;
export interface AiSourceCardsRunResult {
  proposals: SourceCardProposal[];
  warnings: string[];
  discarded: number;
  /** Portions whose request failed on its own; the run went on with the next one. */
  failed: Array<{ range: string; message: string }>;
  /** The run ended early; `from` names the first place of the source that was not evaluated. */
  stopped: { reason: "cancelled" | "limit"; from: string } | { reason: "error"; message: string; from: string } | null;
}
/** Sends one portion to the source cards route and returns its validated answer. */
export type AiSourceCardsRequester = (request: AiSourceCardsRequest, signal: AbortSignal) => Promise<GeneratedSourceCards>;

/** Splits an overlong text at whitespace into parts of at most `max` characters. */
function chunk(text: string, max: number): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const cut = rest.lastIndexOf(" ", max);
    const end = cut > max / 2 ? cut : max;
    parts.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Adds the text as one unit, or as numbered parts when it is too long; `prefix` (a table header) heads every part. */
function pushUnits(units: SourceUnit[], label: string, text: string, prefix = "") {
  const parts = chunk(text, MAX_UNIT_CHARS - (prefix ? prefix.length + 1 : 0));
  parts.forEach((part, index) => units.push({ label: parts.length > 1 ? `${label}, Teil ${index + 1}` : label, text: prefix ? `${prefix}\n${part}` : part }));
}

const lineRange = (first: number, last: number) => first === last ? `Zeile ${first}` : `Zeilen ${first}–${last}`;
const HEADING = /^#{1,6}\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

interface LineBlock { first: number; last: number; lines: string[]; size: number; content: boolean; }

/** Text and Markdown: each paragraph is a place (short ones join the next), never across a heading outside code blocks; the label names heading and lines. */
function textUnits(text: string): SourceUnit[] {
  const units: SourceUnit[] = [];
  let heading = "";
  let fenced = false;
  let block: LineBlock | null = null;
  const flush = () => {
    // A block of headings alone carries nothing to ask about.
    if (block?.content) pushUnits(units, heading ? `${heading} · ${lineRange(block.first, block.last)}` : lineRange(block.first, block.last), block.lines.join("\n"));
    block = null;
  };
  text.replace(/\r\n?/g, "\n").split("\n").forEach((line, index) => {
    const blank = !line.trim();
    const headingMatch = fenced ? null : HEADING.exec(line);
    if (FENCE.test(line)) fenced = !fenced;
    if (headingMatch) flush();
    else if (block && !fenced && (blank ? block.size >= MIN_PARAGRAPH_CHARS : block.size >= MAX_LINE_BLOCK_CHARS)) flush();
    else if (block && !blank && block.size + line.length + 1 > MAX_UNIT_CHARS) flush();
    if (headingMatch) heading = headingMatch[1].length > MAX_HEADING_CHARS ? `${headingMatch[1].slice(0, MAX_HEADING_CHARS - 1).trimEnd()}…` : headingMatch[1];
    if (blank && !block) return;
    block ??= { first: index + 1, last: index + 1, lines: [], size: 0, content: false };
    block.lines.push(line);
    block.size += line.length + 1;
    if (!blank) block.last = index + 1;
    if (!blank && !headingMatch) block.content = true;
  });
  flush();
  return units;
}

/** CSV and TSV: ten records form a place, each unit and part repeats a short header row; a long one stands alone. A quoted cell may span lines. */
function tableUnits(text: string): SourceUnit[] {
  const units: SourceUnit[] = [];
  const [header = "", ...lines] = text.replace(/\r\n?/g, "\n").split("\n");
  const prefix = header.length <= MAX_UNIT_CHARS / 4 ? header : "";
  let block: (LineBlock & { records: number }) | null = null;
  let open = false;
  const flush = () => {
    if (block) pushUnits(units, lineRange(block.first, block.last), block.lines.join("\n"), prefix);
    block = null;
  };
  if (!prefix && lines.some((line) => line.trim())) pushUnits(units, lineRange(1, 1), header);
  lines.forEach((line, index) => {
    if (!open && !line.trim()) return;
    if (!open && block && (block.records === TABLE_ROWS_PER_UNIT || prefix.length + block.size + line.length + 2 > MAX_UNIT_CHARS)) flush();
    block ??= { first: index + 2, last: index + 2, lines: [], size: 0, content: true, records: 0 };
    block.lines.push(line);
    block.size += line.length + 1;
    block.last = index + 2;
    if (!open) block.records += 1;
    // An odd number of quotes opens or closes a quoted cell that continues on the next line.
    if ((line.match(/"/g)?.length ?? 0) % 2) open = !open;
  });
  flush();
  return units;
}

const pdfPagesSchema = v.array(v.looseObject({ pageNumber: v.number(), text: v.string(), textItemCount: v.number() }));

/**
 * Reads the source of an order in the browser and splits it into units with a real place.
 * Empty, protected, scanned and oversized sources are rejected, never cut silently.
 */
export async function readAiSource(draft: Pick<AiSourceCreationDraft, "sourceMode" | "sourceText" | "file">): Promise<ReadSource> {
  if (draft.sourceMode === "text") return splitAiSource({ fileName: "", text: draft.sourceText, textExtractionStatus: "success", metadata: {} });
  const file = draft.file;
  if (!file) throw new AiSourceCardsError("missing_source", "Wähle eine Quelldatei aus.");
  const fileError = aiSourceFileError(file);
  if (fileError) throw new AiSourceCardsError("invalid_source", fileError);
  const { createDocumentFromFile } = await import("./documentModel.ts");
  return splitAiSource(await createDocumentFromFile(file));
}

/** A PDF becomes its pages, a table file blocks of rows, any other text blocks of lines; each unit names its place. */
export function splitAiSource(document: Pick<TransientSourceDocument, "fileName" | "text" | "textExtractionStatus" | "metadata">): ReadSource {
  if (document.textExtractionStatus === "error") throw new AiSourceCardsError("unreadable_source", "Die Datei konnte nicht gelesen werden. Geschützte oder beschädigte Dateien werden nicht unterstützt.");
  if (document.text.length > MAX_AI_SOURCE_CHARS) throw new AiSourceCardsError("source_too_large", `Die Quelle ist zu umfangreich (höchstens ${MAX_AI_SOURCE_CHARS.toLocaleString("de-DE")} Zeichen). Wähle einen kürzeren Ausschnitt.`);
  const notices: string[] = [];
  let units: SourceUnit[] = [];
  const pages = v.safeParse(pdfPagesSchema, document.metadata.pages);
  if (pages.success) {
    const readable = pages.output.filter((page) => page.textItemCount > 0 && page.text.trim());
    const skipped = pages.output.filter((page) => !readable.includes(page)).map((page) => page.pageNumber);
    if (skipped.length && readable.length) notices.push(`${skipped.length === 1 ? "Seite" : "Seiten"} ${skipped.join(", ")} ohne Textlayer ${skipped.length === 1 ? "wurde" : "wurden"} nicht ausgewertet.`);
    for (const page of readable) pushUnits(units, `Seite ${page.pageNumber}`, page.text);
  } else if (document.textExtractionStatus === "success") {
    units = /\.(csv|tsv)$/i.test(document.fileName) ? tableUnits(document.text) : textUnits(document.text);
  }
  if (!units.length) throw new AiSourceCardsError("unreadable_source", "Die Quelle enthält keinen lesbaren Text. Gescannten PDFs fehlt möglicherweise ein Textlayer.");
  return { units, notices };
}

/** Consecutive units packed into portions that each fit one request. */
function sourcePortions(units: SourceUnit[]): SourceUnit[][] {
  const portions: SourceUnit[][] = [];
  let current: SourceUnit[] = [];
  let size = 0;
  for (const unit of units) {
    if (current.length && (size + unit.text.length > MAX_SOURCE_PORTION_CHARS || current.length === MAX_SOURCE_PORTION_UNITS)) {
      portions.push(current);
      current = [];
      size = 0;
    }
    current.push(unit);
    size += unit.text.length;
  }
  if (current.length) portions.push(current);
  return portions;
}

const portionRange = (portion: SourceUnit[]) => portion.length === 1 ? portion[0].label : `${portion[0].label} bis ${portion[portion.length - 1].label}`;

/**
 * Sends the portions one after another and collects the proposals. Each portion receives the questions so far,
 * the run ends at the order limit, and a cancelled or stopped run keeps what it already received.
 */
export async function runAiSourceCards({ units, settings, request, signal, onProgress = () => undefined }: {
  units: SourceUnit[];
  settings: AiSourceCardsRequest["settings"];
  request: AiSourceCardsRequester;
  signal: AbortSignal;
  onProgress?: (progress: { done: number; total: number }) => void;
}): Promise<AiSourceCardsRunResult> {
  const portions = sourcePortions(units);
  const result: AiSourceCardsRunResult = { proposals: [], warnings: [], discarded: 0, failed: [], stopped: null };
  for (const [index, portion] of portions.entries()) {
    onProgress({ done: index, total: portions.length });
    const from = portion[0].label;
    if (signal.aborted) { result.stopped = { reason: "cancelled", from }; break; }
    const limit = MAX_AI_SOURCE_CARDS - result.proposals.length;
    if (limit === 0) { result.stopped = { reason: "limit", from }; break; }
    try {
      // Unit ids only need to be unique within one request; short ones keep the material compact.
      const ids = portion.map((_, unitIndex) => `s${unitIndex + 1}`);
      const labels = new Map(portion.map((unit, unitIndex) => [ids[unitIndex], unit.label]));
      const response = await request({ settings, units: portion.map((unit, unitIndex) => ({ id: ids[unitIndex], ...unit })), avoid: result.proposals.map((proposal) => proposal.front), limit }, signal);
      for (const card of response.cards) {
        result.proposals.push({ ...card, id: `p${result.proposals.length + 1}`, sourceLabels: card.sources.map((id) => labels.get(id) ?? id) });
      }
      for (const warning of response.warnings) if (!result.warnings.includes(warning)) result.warnings.push(warning);
      result.discarded += response.discarded;
    } catch (error) {
      if (signal.aborted) { result.stopped = { reason: "cancelled", from }; break; }
      const message = error instanceof Error ? error.message : "Dieser Abschnitt konnte nicht ausgewertet werden.";
      if (error instanceof AiSourceCardsError && STOPPING_ERROR_CODES.has(error.code)) { result.stopped = { reason: "error", message, from }; break; }
      result.failed.push({ range: portionRange(portion), message });
    }
  }
  if (!result.stopped) onProgress({ done: portions.length, total: portions.length });
  return result;
}

/** Messages of a finished run that the learner must see next to the proposals. */
export function describeAiSourceCardsRun(result: AiSourceCardsRunResult): string[] {
  const messages: string[] = [];
  const stopped = result.stopped;
  if (stopped?.reason === "limit") messages.push(`Die Obergrenze von ${MAX_AI_SOURCE_CARDS} Vorschlägen ist erreicht. Ab ${stopped.from} wurde die Quelle nicht ausgewertet.`);
  if (stopped?.reason === "cancelled") messages.push(`Abgebrochen. Ab ${stopped.from} wurde die Quelle nicht ausgewertet.`);
  if (stopped?.reason === "error") messages.push(`Gestoppt: ${stopped.message} Ab ${stopped.from} wurde die Quelle nicht ausgewertet.`);
  for (const failure of result.failed) messages.push(`${failure.range} konnte nicht ausgewertet werden: ${failure.message}`);
  if (result.discarded) messages.push(`${result.discarded === 1 ? "1 Vorschlag wurde" : `${result.discarded.toLocaleString("de-DE")} Vorschläge wurden`} verworfen: ungültig, doppelt oder über der Obergrenze.`);
  if (!result.proposals.length && !stopped && !result.failed.length) messages.push("Die Quelle ergab keine Kartenvorschläge.");
  return messages;
}

/** Sends one portion to the route and checks its answer; the browser waits a little longer than the route's own deadline. */
export async function requestAiSourceCards(request: AiSourceCardsRequest, supabase: SupabaseClient<Database> | null, signal: AbortSignal, fetchImpl: typeof fetch = globalThis.fetch): Promise<GeneratedSourceCards> {
  const body = await postAiRoute(AI_SOURCE_CARDS_ENDPOINT, parseAiSourceCardsRequest(request), supabase, {
    fetchImpl, signal, timeoutMs: AI_SOURCE_CARDS_DEADLINE_MS + 5_000,
    fail: (code, message) => new AiSourceCardsError(code, message),
    messages: {
      timeout: "Die KI hat nicht rechtzeitig geantwortet.",
      network: "Die Karten konnten nicht angefordert werden. Prüfe deine Verbindung.",
      failed: "Die Karten konnten nicht erstellt werden.",
    },
  });
  return parseAiSourceCardsSuccess(body, request);
}

const html = (value: string) => escapeCardHtmlText(value).replace(/\n/g, "<br>");

/**
 * The content a proposal becomes: the short answer on the back of question–answer cards, the explanation as extra
 * (on the back field of cloze and choice cards), and its places in the source field.
 */
export function proposalNoteContent(proposal: SourceCardProposal, sourceName: string): NoteContent {
  const source = { name: "Quelle", role: "source" as const, value: html(`${sourceName} · ${proposal.sourceLabels.join("; ")}`) };
  const explanation = proposal.explanation ? html(proposal.explanation) : "";
  const input: ManualNoteInput = proposal.form === "basic"
    ? { kind: "basic", front: html(proposal.front), back: html(proposal.back), additionalFields: [...explanation ? [{ name: "Erklärung", role: "extra" as const, value: explanation }] : [], source] }
    : {
      kind: proposal.form, front: html(proposal.front), back: explanation, additionalFields: [source],
      ...proposal.form === "cloze" ? {} : { answerOptions: proposal.options.map((option) => option.text), correctOptionIndices: proposal.options.flatMap((option, index) => option.correct ? [index] : []) },
    };
  return createManualNoteContent(input);
}

/**
 * Stores the proposals one after another through the manual creation path; without a deck id the first one creates
 * the deck. It stops at the first failure and reports how far it came, so the rest can be stored later.
 */
export async function saveProposals(proposals: ProposalDraft[], target: { deckId: string | null; deckName: string }, save: SaveProposal) {
  let deckId = target.deckId;
  let saved = 0;
  let createdCards = 0;
  try {
    for (const proposal of proposals) {
      const result = await save({ deckId, deckName: target.deckName, content: proposal.content, media: {} });
      if (!result) throw new Error("Die Karte konnte nicht gespeichert werden.");
      deckId = result.deck.id;
      saved += 1;
      createdCards += result.cardIds.length;
    }
    return { deckId, saved, createdCards, error: null };
  } catch (error) {
    return { deckId, saved, createdCards, error: error instanceof Error ? error.message : "Die Karte konnte nicht gespeichert werden." };
  }
}

/**
 * The deck an adoption attempt stores into: the chosen deck while it exists, otherwise a top-level deck an earlier
 * attempt of this order created (its name may carry a suffix against a sibling of the same name), otherwise none,
 * so the save creates one.
 */
export function adoptionDeckId(decks: readonly Pick<Deck, "id" | "name" | "parentDeckId" | "deletedAt">[], chosenDeckId: string | null, deckName: string, decksBefore: ReadonlySet<string>): string | null {
  const live = decks.filter((deck) => !deck.deletedAt);
  if (chosenDeckId && live.some((deck) => deck.id === chosenDeckId)) return chosenDeckId;
  const key = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("de-DE");
  return live.find((deck) => !decksBefore.has(deck.id) && deck.parentDeckId === null && key(deck.name).startsWith(key(deckName)))?.id ?? null;
}
