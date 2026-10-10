import assert from "node:assert/strict";
import test from "node:test";
import { createAiGeneratedVariantDraft, requestAiCardVariant } from "./aiCardVariant.ts";
import {
  AiCardVariantContractError,
  createAiCardVariantRequest,
  parseAiCardVariantRequest,
} from "./aiCardVariantContract.ts";
import { addCardVariant, createBasicNote, createManualNoteContent, createNote, planNoteContentChange } from "./coreModel.ts";
import { cardVariantSource } from "./coreVariantService.ts";

function basic(front: string, back: string, tags: string[] = []) {
  const { note, cards } = createBasicNote("deck-1", front, back, { tags });
  return { note, card: cards[0] };
}

test("AI card request projects only normalized question and answer", () => {
  const { note, card } = basic('<p>  Was ist <b>ATP</b>? </p><img src="private-image.png">', "<p>Ein Energie&shy;träger.</p>", ["biologie"]);
  const request = createAiCardVariantRequest(cardVariantSource(note, card));

  assert.deepEqual(Object.keys(request), ["source"]);
  assert.deepEqual(Object.keys(request.source), ["front", "back"]);
  assert.equal(request.source.front, "Was ist ATP?");
  assert.equal(request.source.back.includes("Energie"), true);
  assert.equal(JSON.stringify(request).includes("biologie"), false);
  assert.equal(JSON.stringify(request).includes("private-image.png"), false);
});

test("AI card request rejects cards without question and answer and oversized cards", () => {
  const choice = createNote({
    deckId: "deck-1",
    content: createManualNoteContent({ kind: "single-choice", front: "Frage", back: "Erklärung", answerOptions: ["Richtig", "Falsch"], correctOptionIndices: [0] }),
  });
  const imageOnly = basic('<img src="image-hash.png">', "Hinten");
  assert.throws(() => createAiCardVariantRequest(cardVariantSource(choice.note, choice.cards[0])), (error: unknown) => error instanceof AiCardVariantContractError && error.code === "unsupported_card_type");
  assert.throws(() => createAiCardVariantRequest(cardVariantSource(imageOnly.note, imageOnly.card)), (error: unknown) => error instanceof AiCardVariantContractError && error.code === "unsupported_card_type");
  assert.throws(() => createAiCardVariantRequest({ front: "x".repeat(1_201), back: "Antwort" }), (error: unknown) => error instanceof AiCardVariantContractError && error.code === "invalid_source");

  assert.equal(parseAiCardVariantRequest({ source: { front: "x".repeat(1_201), back: "Antwort" } }).success, false);
  assert.equal(parseAiCardVariantRequest({ source: { front: "x".repeat(1_200), back: "y".repeat(1_200) } }).success, true);
  assert.equal(parseAiCardVariantRequest({ source: { front: "x".repeat(1_200), back: "y".repeat(1_201) } }).success, false);
});

test("browser request authenticates, sends only card text and validates the response", async () => {
  const { note, card } = basic('Frage<img src="secret-media.png">', "Antwort", ["secret-tag"]);
  let requestBody = "";
  const result = await requestAiCardVariant(cardVariantSource(note, card), {
    auth: { getSession: async () => ({ data: { session: { access_token: "session-secret" } }, error: null }) },
  } as any, async (_url, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer session-secret");
    requestBody = String(init?.body);
    return Response.json({
      variant: { front: "Neu gefragt", back: "Neu beantwortet" },
      model: "provider/model:free",
      privacyMode: "zdr",
      usage: null,
    });
  });

  assert.deepEqual(JSON.parse(requestBody), { source: { front: "Frage", back: "Antwort" } });
  assert.equal(requestBody.includes("secret-tag"), false);
  assert.equal(requestBody.includes("secret-media"), false);
  assert.equal(result.variant.front, "Neu gefragt");
});

test("browser request reports missing auth and provider errors", async () => {
  const source = { front: "Frage", back: "Antwort" };
  await assert.rejects(requestAiCardVariant(source, null), (error: unknown) => error instanceof AiCardVariantContractError && error.code === "auth_unavailable");
  const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: "token" } }, error: null }) } } as any;
  await assert.rejects(
    requestAiCardVariant(source, supabase, async () => Response.json({ error: { code: "rate_limited", message: "Zu viele Anfragen." } }, { status: 429 })),
    (error: unknown) => error instanceof AiCardVariantContractError && error.code === "rate_limited",
  );
  await assert.rejects(
    requestAiCardVariant(source, supabase, async () => Response.json({ variant: { front: "Nur vorne" } })),
    (error: unknown) => error instanceof AiCardVariantContractError && error.code === "invalid_response",
  );
  await assert.rejects(
    requestAiCardVariant(source, supabase, async () => new Response("An error occurred with your deployment", { status: 504 })),
    (error: unknown) => error instanceof AiCardVariantContractError && error.code === "request_failed",
  );
  await assert.rejects(
    requestAiCardVariant(source, supabase, async (_url, init) => {
      assert.ok(init?.signal);
      throw new DOMException("The operation timed out.", "TimeoutError");
    }),
    (error: unknown) => error instanceof AiCardVariantContractError && error.code === "timeout",
  );
});

test("generated draft rejects changed sources and duplicate variants", () => {
  const original = basic("Frage", "Antwort");
  const source = cardVariantSource(original.note, original.card);
  assert.ok(source);
  const generated = {
    variant: { front: "Anders gefragt", back: "Gleiche Antwort" },
    model: "provider/model:free",
    privacyMode: "zdr" as const,
    usage: null,
  };
  const draft = createAiGeneratedVariantDraft(source, original, generated);
  assert.equal(draft.meta.generationSource, "ai_generated");
  assert.equal(draft.front, "Anders gefragt");
  assert.equal(draft.meta.promptVersion, "card-variant-v1");
  assert.equal(draft.meta.model, "provider/model:free");

  const changedContent = structuredClone(original.note.content);
  changedContent.fields[0].html = "Inzwischen geändert";
  const changed = planNoteContentChange({ note: original.note, cards: [original.card] }, changedContent);
  assert.throws(() => createAiGeneratedVariantDraft(source, { note: changed.note, card: original.card }, generated), (error: unknown) => error instanceof AiCardVariantContractError && error.code === "source_changed");
  assert.throws(() => createAiGeneratedVariantDraft(source, null, generated), (error: unknown) => error instanceof AiCardVariantContractError && error.code === "source_changed");

  const withDuplicate = addCardVariant(original.card, { front: "Anders gefragt", back: "Gleiche Antwort" });
  assert.throws(() => createAiGeneratedVariantDraft(source, { note: original.note, card: withDuplicate }, generated), (error: unknown) => error instanceof AiCardVariantContractError && error.code === "duplicate_variant");
});
