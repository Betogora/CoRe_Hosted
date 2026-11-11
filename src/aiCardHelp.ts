import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_CARD_HELP_DEADLINE_MS, AI_CARD_HELP_ENDPOINT, MAX_AI_CARD_HELP_FIELD_CHARS, parseAiCardHelpSuccess, type AiCardHelpRequest,
} from "./aiCardHelpContract.ts";
import { postAiRoute } from "./aiRouteRequest.ts";
import type { Card, Note, NoteFieldRole } from "./coreTypes.ts";
import type { Database } from "./database.types.ts";
import { notePlainText } from "./notePresentation.ts";

const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g;

function plain(html: string) {
  return notePlainText(html).replace(/\s+/g, " ").trim();
}

function clip(text: string) {
  return text.length > MAX_AI_CARD_HELP_FIELD_CHARS ? `${text.slice(0, MAX_AI_CARD_HELP_FIELD_CHARS - 1)}…` : text;
}

function joined(htmls: string[]) {
  return clip(htmls.map(plain).filter(Boolean).join("\n"));
}

/**
 * The plain text of the card the learner sees, as question, answer and supplements; the source field stays local.
 * Cloze cards hide only their own gap. Image occlusions and cards without readable text have no learning help.
 */
export function aiCardHelpCard(note: Pick<Note, "content">, card: Pick<Card, "promptKey">): AiCardHelpRequest["card"] | null {
  const { fields, interaction } = note.content;
  const htmlOf = (roles: NoteFieldRole[]) => fields.filter((field) => roles.includes(field.role)).map((field) => field.html);
  let prompt = "";
  let answer = "";
  if (interaction.kind === "image-occlusion") return null;
  if (interaction.kind === "reveal") {
    const revealPrompt = interaction.prompts.find((candidate) => candidate.key === card.promptKey);
    if (!revealPrompt) return null;
    const htmlById = (ids: string[]) => ids.map((id) => fields.find((field) => field.id === id)?.html ?? "");
    prompt = joined(htmlById(revealPrompt.questionFieldIds));
    answer = joined(htmlById(revealPrompt.answerFieldIds));
  } else if (interaction.kind === "cloze") {
    const gap = card.promptKey.replace(/^cloze:/, "");
    const hidden: string[] = [];
    prompt = joined(htmlOf(["prompt"]).map((html) => html.replace(CLOZE, (_match, number: string, content: string) => {
      if (number !== gap) return content;
      hidden.push(content);
      return "[…]";
    })));
    answer = joined(hidden);
  } else {
    prompt = joined(htmlOf(["prompt"]));
    const options = (correct: boolean) => interaction.options.filter((option) => option.correct === correct).map((option) => plain(option.html)).filter(Boolean).join("; ");
    answer = clip([["Richtig", options(true)], ["Falsch", options(false)]].filter(([, list]) => list).map(([label, list]) => `${label}: ${list}`).join("\n"));
  }
  const extra = joined(htmlOf(["hint", "extra", "note"]));
  if (!prompt || !answer) return null;
  return extra ? { prompt, answer, extra } : { prompt, answer };
}

/** Asks the learning help about one card and returns its plain-text answer; errors carry a German message. */
export async function requestAiCardHelp(request: AiCardHelpRequest, supabase: SupabaseClient<Database> | null, { signal, fetchImpl = globalThis.fetch }: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<string> {
  const body = await postAiRoute(AI_CARD_HELP_ENDPOINT, request, supabase, {
    fetchImpl,
    signal,
    // The route ends itself after its deadline; the margin covers authentication and network.
    timeoutMs: AI_CARD_HELP_DEADLINE_MS + 5_000,
    fail: (_code, message) => new Error(message),
    messages: {
      timeout: "Die Antwort hat zu lange gedauert. Bitte frag erneut.",
      network: "Die Frage konnte nicht gesendet werden. Prüfe deine Verbindung.",
      failed: "Die KI-Hilfe konnte nicht antworten.",
    },
  });
  const parsed = parseAiCardHelpSuccess(body);
  if (!parsed.success) throw new Error("Die KI-Hilfe hat keine gültige Antwort geliefert.");
  return parsed.output.answer;
}
