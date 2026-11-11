import assert from "node:assert/strict";
import test from "node:test";
import { aiCardHelpCard, requestAiCardHelp } from "./aiCardHelp.ts";
import { MAX_AI_CARD_HELP_FIELD_CHARS } from "./aiCardHelpContract.ts";
import type { Note, NoteField, NoteInteraction } from "./coreTypes.ts";

function note(fields: Array<Pick<NoteField, "id" | "role" | "html">>, interaction: NoteInteraction): Pick<Note, "content"> {
  return { content: { schemaVersion: 1, fields: fields.map((field) => ({ ...field, name: field.id })), interaction, speech: [], tags: [] } } as Pick<Note, "content">;
}

const reveal = note(
  [{ id: "front", role: "prompt", html: "Was ist <b>ATP</b>?" }, { id: "back", role: "answer", html: "Ein Energieträger" }, { id: "extra", role: "extra", html: "Adenosintriphosphat" }, { id: "src", role: "source", html: "Lehrbuch S. 12" }],
  { kind: "reveal", prompts: [
    { key: "forward", name: "Vorwärts", instruction: "", questionFieldIds: ["front"], answerFieldIds: ["back"], requires: null, typeInFieldId: null },
    { key: "reverse", name: "Rückwärts", instruction: "", questionFieldIds: ["back"], answerFieldIds: ["front"], requires: null, typeInFieldId: null },
  ] },
);

test("reveal cards send the side the learner saw as question, plus supplements but never the source", () => {
  assert.deepEqual(aiCardHelpCard(reveal, { promptKey: "forward" }), { prompt: "Was ist ATP?", answer: "Ein Energieträger", extra: "Adenosintriphosphat" });
  assert.deepEqual(aiCardHelpCard(reveal, { promptKey: "reverse" }), { prompt: "Ein Energieträger", answer: "Was ist ATP?", extra: "Adenosintriphosphat" });
  assert.equal(aiCardHelpCard(reveal, { promptKey: "missing" }), null);
});

test("cloze cards hide only their own gap and answer with its content", () => {
  const cloze = note([{ id: "text", role: "prompt", html: "{{c1::Mitochondrien}} bilden {{c2::ATP::Molekül}}." }], { kind: "cloze" });
  assert.deepEqual(aiCardHelpCard(cloze, { promptKey: "cloze:2" }), { prompt: "Mitochondrien bilden […].", answer: "ATP" });
});

test("choice cards name correct and wrong options; image occlusions and empty cards get no help", () => {
  const choice = note([{ id: "q", role: "prompt", html: "Welche Organelle bildet ATP?" }], { kind: "choice", mode: "single", options: [
    { id: "a", html: "Mitochondrium", correct: true },
    { id: "b", html: "Ribosom", correct: false },
  ] });
  assert.deepEqual(aiCardHelpCard(choice, { promptKey: "choice" }), { prompt: "Welche Organelle bildet ATP?", answer: "Richtig: Mitochondrium\nFalsch: Ribosom" });
  const occlusion = note([], { kind: "image-occlusion", image: { name: "bild.png" } as never, mode: "hide-all-guess-one", masks: [] });
  assert.equal(aiCardHelpCard(occlusion, { promptKey: "mask:1" }), null);
  assert.equal(aiCardHelpCard(note([{ id: "front", role: "prompt", html: "<img src=\"a.png\">" }, { id: "back", role: "answer", html: "Herz" }], reveal.content.interaction), { promptKey: "forward" }), null);
  const long = note([{ id: "q", role: "prompt", html: "Welche?" }], { kind: "choice", mode: "multiple", options: Array.from({ length: 30 }, (_, index) => ({ id: String(index), html: "x".repeat(200), correct: index === 0 })) });
  assert.equal(aiCardHelpCard(long, { promptKey: "choice" })?.answer.length, MAX_AI_CARD_HELP_FIELD_CHARS);
});

test("browser request sends the session token and returns only a valid answer", async () => {
  const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: "token" } }, error: null }) } } as any;
  const request = { card: { prompt: "Was ist ATP?", answer: "Ein Energieträger" }, mode: "explain" as const };
  let sent: RequestInit | undefined;
  const answer = await requestAiCardHelp(request, supabase, { fetchImpl: async (url, init) => {
    assert.equal(url, "/api/ai/card-help");
    sent = init;
    return Response.json({ answer: "ATP speichert Energie.", model: "m", privacyMode: "zdr", usage: null });
  } });
  assert.equal(answer, "ATP speichert Energie.");
  assert.equal((sent?.headers as Record<string, string>).Authorization, "Bearer token");
  assert.deepEqual(JSON.parse(String(sent?.body)), request);
  await assert.rejects(requestAiCardHelp(request, supabase, { fetchImpl: async () => Response.json({ answer: "" }) }), /keine gültige Antwort/);
  await assert.rejects(requestAiCardHelp(request, supabase, { fetchImpl: async () => Response.json({ error: { code: "rate_limited", message: "Zu viele Fragen." } }, { status: 429 }) }), /Zu viele Fragen\./);
});
