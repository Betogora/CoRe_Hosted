import assert from "node:assert/strict";
import test from "node:test";
import { createAiGeneratedVariantDraft, requestAiCardVariant } from "./aiCardVariant.ts";
import {
  AiCardVariantContractError,
  createAiCardVariantRequest,
  parseAiCardVariantRequest,
} from "./aiCardVariantContract.ts";
import { addRephrasedVariant, createBasicLearningItem, getCardContentPayload, saveCardEditorValue } from "./coreModel.ts";

test("AI card request projects only normalized Basic front and back", () => {
  const card = createBasicLearningItem("deck-1", "<p>  Was ist <b>ATP</b>? </p>", "<p>Ein Energie&shy;träger.</p>", {
    tags: ["biologie"],
    mediaRefs: ["private/image.png"],
  });
  const payload = getCardContentPayload(card);
  assert.ok(payload);
  const request = createAiCardVariantRequest(payload);

  assert.deepEqual(Object.keys(request), ["source"]);
  assert.deepEqual(Object.keys(request.source), ["front", "back"]);
  assert.equal(request.source.front, "Was ist ATP?");
  assert.equal(request.source.back.includes("Energie"), true);
  assert.equal(JSON.stringify(request).includes("biologie"), false);
  assert.equal(JSON.stringify(request).includes("private/image.png"), false);
});

test("AI card request rejects non-Basic and oversized cards", () => {
  const reverse = getCardContentPayload(createBasicLearningItem("deck-1", "Vorne", "Hinten", { cardType: "basic-reversed" }));
  const withImages = getCardContentPayload(createBasicLearningItem("deck-1", '<p>Vorne</p><img src="image-hash">', "Hinten", { cardType: "basic-with-images", mediaRefs: ["image-hash"] }));
  assert.ok(reverse);
  assert.ok(withImages);
  assert.throws(() => createAiCardVariantRequest(reverse), (error: unknown) => error instanceof AiCardVariantContractError && error.code === "unsupported_card_type");
  assert.throws(() => createAiCardVariantRequest(withImages), (error: unknown) => error instanceof AiCardVariantContractError && error.code === "unsupported_card_type");

  assert.equal(parseAiCardVariantRequest({ source: { front: "x".repeat(1_201), back: "Antwort" } }).success, false);
  assert.equal(parseAiCardVariantRequest({ source: { front: "x".repeat(1_200), back: "y".repeat(1_200) } }).success, true);
  assert.equal(parseAiCardVariantRequest({ source: { front: "x".repeat(1_200), back: "y".repeat(1_201) } }).success, false);
});

test("browser request authenticates, sends only card text and validates the response", async () => {
  const card = createBasicLearningItem("deck-1", "Frage", "Antwort", { tags: ["secret-tag"], mediaRefs: ["secret-media"] });
  const payload = getCardContentPayload(card);
  assert.ok(payload);
  let requestBody = "";
  const result = await requestAiCardVariant(payload, {
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

  assert.equal(requestBody.includes("secret-tag"), false);
  assert.equal(requestBody.includes("secret-media"), false);
  assert.equal(result.variant.front, "Neu gefragt");
});

test("generated draft rejects changed sources and duplicate variants", () => {
  const original = createBasicLearningItem("deck-1", "Frage", "Antwort");
  const payload = getCardContentPayload(original);
  assert.ok(payload);
  const generated = {
    variant: { front: "Anders gefragt", back: "Gleiche Antwort" },
    model: "provider/model:free",
    privacyMode: "zdr" as const,
    usage: null,
  };
  const draft = createAiGeneratedVariantDraft(payload, original, generated);
  assert.equal(draft.generationSource, "ai_generated");
  assert.equal(draft.meta.promptVersion, "card-variant-v1");

  const changed = saveCardEditorValue(original, { cardType: "basic", front: "Inzwischen geändert", back: "Antwort", tags: [] });
  assert.throws(() => createAiGeneratedVariantDraft(payload, changed, generated), (error: unknown) => error instanceof AiCardVariantContractError && error.code === "source_changed");

  const withDuplicate = addRephrasedVariant(original, "Anders gefragt", "Gleiche Antwort");
  assert.throws(() => createAiGeneratedVariantDraft(payload, withDuplicate, generated), (error: unknown) => error instanceof AiCardVariantContractError && error.code === "duplicate_variant");
});
