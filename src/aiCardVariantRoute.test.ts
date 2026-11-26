import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenRouterPayload, extractGeneratedVariant } from "../api/ai/card-variant.ts";
import { OPENROUTER_MODEL } from "../server/aiRoute.ts";
import { choiceAnswerText, parseAiCardVariantRequest } from "./aiCardVariantContract.ts";

const input = { kind: "basic" as const, source: { front: "Was ist ATP?", back: "Ein Energieträger." } };
function completion(modelId = OPENROUTER_MODEL) {
  return {
    model: modelId,
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, front: "Wofür steht ATP?", back: "ATP ist ein Energieträger." }) } }] } }],
    usage: { prompt_tokens: 120, completion_tokens: 42, total_tokens: 162, cost: 0.00003 },
  };
}

test("OpenRouter payload forces one compact tool call on the fixed model with ZDR and no training", () => {
  const payload = buildOpenRouterPayload(input);
  assert.equal(payload.model, OPENROUTER_MODEL);
  assert.equal(payload.max_tokens, 1_024);
  assert.equal(payload.stream, false);
  assert.deepEqual(payload.tool_choice, { type: "function", function: { name: "create_card_variant" } });
  assert.deepEqual(payload.reasoning, { effort: "medium" });
  assert.deepEqual(payload.provider, { require_parameters: true, data_collection: "deny", zdr: true });
  assert.equal(JSON.stringify(payload).includes("genau einmal create_card_variant"), true);
  assert.doesNotMatch(payload.messages[0].content, /eingetippt/);
  assert.match(buildOpenRouterPayload({ ...input, kind: "type-in" }).messages[0].content, /eingetippt und zeichengenau verglichen/);
  assert.deepEqual(JSON.parse(payload.messages[1].content), { source: input.source });

  const withAvoid = buildOpenRouterPayload({ ...input, avoid: ["Wofür steht ATP?"] });
  assert.deepEqual(JSON.parse(withAvoid.messages[1].content), { source: input.source, avoid: ["Wofür steht ATP?"] });
  assert.match(withAvoid.messages[0].content, /nicht mit denselben ersten Wörtern/);
});

test("provider extraction requires exactly one changed create_card_variant call", () => {
  const { result, costUsd } = extractGeneratedVariant(completion(), input);
  assert.equal(result.variant.front, "Wofür steht ATP?");
  assert.equal(extractGeneratedVariant(completion(), { ...input, kind: "type-in" }).result.variant.back, input.source.back, "beim Eintippen zählt zeichengenau die Antwort der Karte");
  assert.equal(result.privacyMode, "zdr");
  assert.equal(result.usage?.totalTokens, 162);
  assert.equal(costUsd, 0.00003);

  assert.throws(() => extractGeneratedVariant({ choices: [{ message: { tool_calls: [] } }] }, input));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [
      { function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, front: "Neu", back: "Antwort" }) } },
      { function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, front: "Noch neuer", back: "Antwort" }) } },
    ] } }],
  }, input));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "other_tool", arguments: JSON.stringify({ rephrasable: true, front: "Neu", back: "Antwort" }) } }] } }],
  }, input));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, front: "Neu", back: "Antwort", note: "extra" }) } }] } }],
  }, input));
  assert.throws(() => extractGeneratedVariant({
    choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, ...input.source }) } }] } }],
  }, input));
});

test("a card the model reports as not rephrasable becomes its own error instead of a variant", () => {
  const report = (args: unknown) => ({ choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify(args) } }] } }] });
  assert.throws(() => extractGeneratedVariant(report({ rephrasable: false, front: "", back: "" }), input), (error: unknown) => (error as { code?: string }).code === "not_rephrasable" && (error as { statusCode?: number }).statusCode === 422);
  assert.throws(() => extractGeneratedVariant(report({ rephrasable: "nein", front: "Neu", back: "Antwort" }), input), (error: unknown) => (error as { code?: string }).code === "invalid_tool_call");
  assert.throws(() => extractGeneratedVariant(report({ front: "Neu", back: "Antwort" }), input), (error: unknown) => (error as { code?: string }).code === "invalid_tool_call");
});

test("a cloze variant keeps its gap group and solutions, names them nowhere else and keeps the source's answer", () => {
  const cloze = { kind: "cloze" as const, source: { front: "Die {{c1::Titanic}} sank im Jahr 1912.", back: "Titanic" } };
  const answer = (front: string) => ({ choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, front, back: "beliebig" }) } }] } }] });
  const code = (front: string) => { try { extractGeneratedVariant(answer(front), cloze); return "ok"; } catch (error) { return (error as { code?: string }).code; } };

  assert.match(buildOpenRouterPayload(cloze).messages[0].content, /Lückentext/);
  assert.doesNotMatch(buildOpenRouterPayload(input).messages[0].content, /Lückentext/);
  assert.deepEqual(extractGeneratedVariant(answer("Im Jahr 1912 ging die {{c1::Titanic}} unter."), cloze).result.variant, { front: "Im Jahr 1912 ging die {{c1::Titanic}} unter.", back: "Titanic" });
  const formula = { kind: "cloze" as const, source: { front: "Ist {{c1::K < 1}}, überwiegt die Rückreaktion.", back: "K < 1" } };
  assert.equal(extractGeneratedVariant(answer("Die Rückreaktion überwiegt, wenn {{c1::K < 1}} gilt."), formula).result.variant.front, "Die Rückreaktion überwiegt, wenn {{c1::K < 1}} gilt.");
  assert.equal(code("Im Jahr 1912 ging die {{c2::Titanic}} unter."), "invalid_gaps");
  assert.equal(code("Im Jahr {{c1::1912}} ging die {{c1::Titanic}} unter."), "changed_answer");
  assert.equal(code("Im Jahr 1912 ging die {{c1::Lusitania}} unter."), "changed_answer");
  assert.equal(code("Die Titanic, also die {{c1::Titanic}}, ging 1912 unter."), "revealed_answer");
  assert.equal(code("Im Jahr 1912 ging die {{c1::Titanic::Schiff mit Namen Titanic}} unter."), "revealed_answer");
  assert.equal(code("Die {{c1::Titanic}} sank im Jahr 1912."), "invalid_variant");
});

test("a choice variant rephrases stem and options by id, keeps every option's correctness and never negates the question", () => {
  const choice = {
    kind: "choice" as const,
    source: { front: "Welche Elektrolyte sind Kationen?", back: "✓ Natrium · ✗ Chlorid" },
    choice: { mode: "multiple" as const, options: [{ id: "na", text: "Natrium", correct: true }, { id: "cl", text: "Chlorid", correct: false }] },
  };
  const answer = (front: string, options: unknown) => ({ choices: [{ message: { tool_calls: [{ function: { name: "create_card_variant", arguments: JSON.stringify({ rephrasable: true, front, options }) } }] } }] });
  const code = (front: string, options: unknown) => { try { extractGeneratedVariant(answer(front, options), choice); return "ok"; } catch (error) { return (error as { code?: string }).code; } };
  const payload = buildOpenRouterPayload(choice);

  assert.match(payload.messages[0].content, /Auswahlfrage/);
  assert.deepEqual(payload.tools[0].function.parameters.required, ["rephrasable", "front", "options"]);
  assert.deepEqual(JSON.parse(payload.messages[1].content).choice, choice.choice);
  assert.deepEqual(extractGeneratedVariant(answer("Welche dieser Ionen sind positiv geladen?", [{ id: "cl", text: "Chlorid-Ion" }, { id: "na", text: "Natrium-Ion" }]), choice).result.variant, {
    front: "Welche dieser Ionen sind positiv geladen?",
    back: "✓ Natrium-Ion · ✗ Chlorid-Ion",
    options: [{ id: "na", text: "Natrium-Ion" }, { id: "cl", text: "Chlorid-Ion" }],
  });
  assert.equal(code("Welche dieser Ionen sind positiv geladen?", [{ id: "na", text: "Natrium" }]), "changed_options");
  assert.equal(code("Welche dieser Ionen sind positiv geladen?", [{ id: "na", text: "Natrium" }, { id: "k", text: "Kalium" }]), "changed_options");
  assert.equal(code("Welche dieser Ionen sind nicht positiv geladen?", [{ id: "na", text: "Natrium" }, { id: "cl", text: "Chlorid" }]), "negated_question");
  assert.equal(code("Welche dieser Ionen sind positiv geladen?", [{ id: "na", text: "kein Natrium" }, { id: "cl", text: "Chlorid" }]), "negated_option");

  const negatedSource = { ...choice, source: { ...choice.source, front: "Welches Ion ist kein Kation?" } };
  const removed = () => { try { extractGeneratedVariant(answer("Welches Ion ist positiv geladen?", [{ id: "na", text: "Natrium" }, { id: "cl", text: "Chlorid" }]), negatedSource); return "ok"; } catch (error) { return (error as { code?: string }).code; } };
  assert.equal(removed(), "negated_question", "eine entfernte Verneinung vertauscht richtig und falsch ebenso");
  const kprim = { kind: "choice" as const, source: { front: "Welche Aussagen stimmen?", back: "x" }, choice: { mode: "kprim" as const, options: [{ id: "a", text: "Insulin senkt den Blutzucker.", correct: true }, { id: "b", text: "Glukagon senkt ihn nicht.", correct: true }] } };
  assert.deepEqual(buildOpenRouterPayload(kprim).reasoning, { effort: "low" }, "Auswahl bleibt bei low");
  const kprimCode = (options: unknown) => { try { extractGeneratedVariant(answer("Welche Aussagen treffen zu?", options), kprim); return "ok"; } catch (error) { return (error as { code?: string }).code; } };
  assert.equal(kprimCode([{ id: "a", text: "Insulin senkt den Blutzucker nicht." }, { id: "b", text: "Glukagon senkt ihn nicht." }]), "negated_option");
  assert.equal(kprimCode([{ id: "a", text: "Insulin verringert den Blutzucker." }, { id: "b", text: "Glukagon senkt ihn." }]), "negated_option");
  assert.equal(kprimCode([{ id: "a", text: "Insulin verringert den Blutzucker." }, { id: "b", text: "Glukagon verringert ihn nicht." }]), "ok");

  const long = (index: number) => `Aussage ${index}: ${"x".repeat(290)}`;
  assert.equal(parseAiCardVariantRequest({ kind: "choice", source: { front: "Welche Aussagen stimmen?", back: choiceAnswerText([1, 2, 3, 4].map((index) => ({ text: long(index), correct: index % 2 === 0 }))) }, choice: { mode: "kprim", options: [1, 2, 3, 4].map((index) => ({ id: `o${index}`, text: long(index), correct: index % 2 === 0 })) } }).success, true, "lange Kprim-Aussagen passen über das Feldlimit der Rückseite hinaus");
  assert.equal(code("Welche dieser Ionen sind positiv geladen?", [{ id: "na", text: "Natrium", correct: false }, { id: "cl", text: "Chlorid" }]), "invalid_tool_call");
  assert.equal(parseAiCardVariantRequest({ kind: "choice", source: choice.source }).success, false);
  assert.equal(parseAiCardVariantRequest({ ...choice, choice: { ...choice.choice, options: [choice.choice.options[0], choice.choice.options[0]] } }).success, false);
});

test("a cloze request needs exactly one complete gap group", () => {
  const request = (front: string) => parseAiCardVariantRequest({ kind: "cloze", source: { front, back: "x" } }).success;
  assert.equal(request("Die {{c1::Titanic}} sank."), true);
  assert.equal(request("Die Titanic sank."), false);
  assert.equal(request("Die {{c1::Titanic}} sank {{c2::1912}}."), false);
  assert.equal(request("Die {{c1::Titanic sank."), false);
});
