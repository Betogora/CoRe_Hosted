import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceCardsToolPayload, extractGeneratedSourceCards } from "../api/ai/source-cards.ts";
import { OPENROUTER_MODEL } from "../server/aiRoute.ts";
import { parseAiSourceCardsRequest, parseGeneratedSourceCards } from "./aiSourceCardsContract.ts";
import { createAiSourceCreationDraft, type AiSourceSettings } from "./aiSourceCreation.ts";

const { wishes: _wishes, ...defaults } = createAiSourceCreationDraft().settings;
const settings = { ...defaults, cardForms: ["basic", "cloze", "single-choice", "multiple-choice"] as AiSourceSettings["cardForms"], wishes: "Schwerpunkt Atmungskette" };
const request = {
  settings,
  units: [{ id: "s1", label: "Seite 1", text: "ATP ist der wichtigste Energieträger der Zelle." }, { id: "s2", label: "Seite 2", text: "Die Atmungskette liegt in der inneren Mitochondrienmembran." }],
  avoid: ["Was ist NADH?"],
  limit: 100,
};
const input = parseAiSourceCardsRequest(request);
const basic = { form: "basic", front: "Was ist der wichtigste Energieträger der Zelle?", back: "ATP", options: [], explanation: "", sources: ["s1"] };
const cloze = { form: "cloze", front: "Die Atmungskette liegt in der {{c1::inneren Mitochondrienmembran}}.", back: "", options: [], explanation: "", sources: ["s2"] };
const single = { form: "single-choice", front: "Wo liegt die Atmungskette?", back: "", options: [{ text: "Innere Mitochondrienmembran", correct: true }, { text: "Zellkern", correct: false }], explanation: "Laut Seite 2.", sources: ["s2"] };
const multiple = { ...single, form: "multiple-choice", front: "Was gilt für ATP und die Atmungskette?", options: [{ text: "ATP trägt Energie", correct: true }, { text: "Die Kette liegt innen", correct: true }, { text: "ATP ist ein Enzym", correct: false }], sources: ["s1", "s2"] };
const generated = { cards: [basic, cloze, single, multiple], warnings: [] };
const completion = (value: unknown = generated, name = "create_source_cards", finish_reason = "tool_calls") => ({ model: OPENROUTER_MODEL, choices: [{ finish_reason, message: { tool_calls: [{ function: { name, arguments: JSON.stringify(value) } }] } }], usage: { prompt_tokens: 2_000, completion_tokens: 800, total_tokens: 2_800, cost: 0.002 } });
test("Quellenkarten-Tool nutzt das feste Modell mit ZDR, trennt Auftrag und Material und bindet Formen, Belege und Menge", () => {
  const payload = buildSourceCardsToolPayload(parseAiSourceCardsRequest({ ...request, settings: { ...settings, cardForms: ["basic", "cloze"] }, limit: 7 }));
  assert.equal(payload.model, OPENROUTER_MODEL);
  assert.deepEqual(payload.provider, { require_parameters: true, data_collection: "deny", zdr: true });
  assert.equal(payload.tool_choice.function.name, "create_source_cards");
  const system = payload.messages[0].content;
  assert.match(system, /Kartenmenge: Erstelle Karten für die Kernaussagen und wichtigen Zusammenhänge\./);
  assert.match(system, /etwa 1 Karte; erstelle höchstens 7\./);
  assert.match(system, /avoid enthält Fragen/);
  assert.ok(system.includes(JSON.stringify("Schwerpunkt Atmungskette")));
  assert.doesNotMatch(system, /ATP ist der wichtigste/);
  assert.deepEqual(JSON.parse(payload.messages[1].content), { material: request.units, avoid: request.avoid });
  const card = payload.tools[0].function.parameters.properties.cards;
  assert.equal(card.maxItems, 7);
  assert.deepEqual(card.items.properties.form.enum, ["basic", "cloze"]);
  assert.deepEqual(card.items.properties.sources.items.enum, ["s1", "s2"]);
  assert.equal(buildSourceCardsToolPayload(input).tools[0].function.parameters.properties.cards.maxItems, 45);
});

test("Alle vier Kartenformen kommen mit Beleg, Modell und Kosten zurück", () => {
  const result = extractGeneratedSourceCards(completion(), input);
  assert.deepEqual(result.cards.map((card) => card.form), ["basic", "cloze", "single-choice", "multiple-choice"]);
  assert.equal(result.discarded, 0);
  assert.equal(result.privacyMode, "zdr");
  assert.equal(result.promptVersion, "source-cards-v3");
  assert.equal(result.usage?.totalTokens, 2_800);
});

test("Ungültige, nicht erlaubte, unbelegte oder wiederholte Vorschläge werden verworfen und gezählt", () => {
  const rejected = [
    { ...basic, front: "Wofür steht ATP?", back: "" },
    { ...basic, front: "Was ist ATP genau?", options: single.options },
    { ...cloze, front: "Die Atmungskette liegt in der Membran." },
    { ...cloze, front: "{{c1::ATP}} und {{c2::ADP}} sind Nukleotide." },
    { ...cloze, front: "{{c1::ATP}} und {{c1::ADP}} sind Nukleotide." },
    { ...cloze, front: "Die {{c1::Atmungskette}} liegt innen.", explanation: "Siehe {{c1::Membran}}." },
    { ...basic, front: "Die Atmungskette liegt in der {{c1::inneren Membran}}.", back: "innere Membran" },
    { ...cloze, front: "Die {{c1:: }} liegt innen." },
    { ...single, options: single.options.map((option) => ({ ...option, correct: true })) },
    { ...single, options: [single.options[0]] },
    { ...single, options: [single.options[0], { text: "innere  mitochondrienmembran", correct: false }] },
    { ...multiple, options: multiple.options.map((option) => ({ ...option, correct: true })) },
    { ...basic, front: "Wofür steht ATP?", sources: ["s9"] },
    { ...basic, front: "Wofür steht ATP?", sources: ["s1", "s1"] },
    { ...basic, front: "  was ist  NADH? " },
    { ...basic, front: "Ein ungültiges Feld", html: "<b>x</b>" },
    { ...basic, front: "Was ist der wichtigste Energieträger der Zelle?" },
  ];
  const result = parseGeneratedSourceCards({ cards: [basic, ...rejected], warnings: ["Seite 2 ist knapp.", " "] }, input);
  assert.deepEqual(result.cards, [basic]);
  assert.equal(result.discarded, rejected.length);
  assert.deepEqual(result.warnings, ["Seite 2 ist knapp."]);
  assert.deepEqual(parseGeneratedSourceCards({ cards: [{ ...cloze, front: "Die {{c1::Atmungskette::Prozess}} liegt innen." }], warnings: [] }, input).discarded, 0);
});

test("Formeln mit geschweiften Klammern bleiben erhalten, eine Lösung außerhalb von Frage–Antwort fällt weg", () => {
  const formula = { ...basic, front: "Wie lautet die Ableitung von e^{x^{2}}?", back: "2x·e^{x^{2}}" };
  const choiceWithBack = { ...single, back: "Innere Mitochondrienmembran" };
  const result = parseGeneratedSourceCards({ cards: [formula, choiceWithBack], warnings: [] }, input);
  assert.deepEqual(result.cards, [formula, { ...choiceWithBack, back: "" }]);
  const basicOnly = parseAiSourceCardsRequest({ ...request, settings: { ...settings, cardForms: ["basic"] } });
  assert.deepEqual(parseGeneratedSourceCards(generated, basicOnly), { cards: [basic], warnings: [], discarded: 3 });
});

test("Vorschläge über dem Rest- oder Abschnittslimit und unbrauchbare Hinweise fallen einzeln heraus", () => {
  const result = parseGeneratedSourceCards({ cards: [{ ...basic, back: "" }, ...generated.cards], warnings: [] }, parseAiSourceCardsRequest({ ...request, limit: 2 }));
  assert.deepEqual(result.cards, [basic, cloze]);
  assert.equal(result.discarded, 3);
  const many = Array.from({ length: 46 }, (_, index) => ({ ...basic, front: `Frage ${index + 1}?` }));
  const warnings = [...Array.from({ length: 9 }, (_, index) => `Hinweis ${index + 1}`), "x".repeat(601), 7];
  const capped = parseGeneratedSourceCards({ cards: many, warnings }, input);
  assert.equal(capped.cards.length, 45);
  assert.equal(capped.discarded, 1);
  assert.deepEqual(capped.warnings, Array.from({ length: 8 }, (_, index) => `Hinweis ${index + 1}`));
});

test("Abgeschnittene oder falsch aufgebaute Antworten werden ganz verworfen", () => {
  assert.throws(() => extractGeneratedSourceCards(completion(generated, "create_source_cards", "length"), input), /abgeschnitten/);
  assert.throws(() => extractGeneratedSourceCards(completion(generated, "other"), input), /Kartenwerkzeug/);
  assert.throws(() => extractGeneratedSourceCards(completion({ cards: [basic] }), input), /keine gültigen Kartenvorschläge/);
  assert.throws(() => extractGeneratedSourceCards(completion({ ...generated, extra: "Ergänzung" }), input), /keine gültigen Kartenvorschläge/);
});

test("Auftrag ohne Kartenform, mit doppelten Abschnitten, Ergänzungsschalter oder zu großem Abschnitt wird abgewiesen", () => {
  for (const value of [
    { ...request, settings: { ...settings, cardForms: [] } },
    { ...request, settings: { ...settings, cardForms: ["basic", "basic"] } },
    { ...request, settings: { ...settings, allowExtraInformation: true } },
    { ...request, units: [request.units[0], request.units[0]] },
    { ...request, units: [] },
    { ...request, limit: 0 },
    { ...request, limit: 101 },
    { ...request, avoid: Array.from({ length: 100 }, (_, index) => `Frage ${index}`) },
  ]) assert.throws(() => parseAiSourceCardsRequest(value), (error: Error & { code?: string }) => error.code === "invalid_request");
  assert.throws(() => parseAiSourceCardsRequest({ ...request, units: [{ id: "s1", label: "Seite 1", text: "x".repeat(6_001) }] }), (error: Error & { code?: string }) => error.code === "portion_too_large");
});
