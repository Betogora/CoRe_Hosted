import assert from "node:assert/strict";
import test from "node:test";
import { addCardVariant, createBasicNote, createManualNoteContent, createNote } from "./coreModel.ts";
import { cardVariantSource, classifyCardEligibility, variantPresentation } from "./coreVariantService.ts";
import type { NoteContent } from "./coreTypes.ts";

test("Variantenquelle liefert reinen Text der Abfrage, auch für die Rückrichtung", () => {
  const { note, cards } = createBasicNote("deck", "<p>Was ist <b>ATP</b> genau?&nbsp;</p>", "<p>Energieträger</p>", { reverse: true });
  const [forward, reverse] = cards;
  assert.deepEqual(cardVariantSource(note, forward), { front: "Was ist ATP genau?", back: "Energieträger" });
  assert.deepEqual(cardVariantSource(note, reverse), { front: "Energieträger", back: "Was ist ATP genau?" });
  assert.equal(cardVariantSource(note, { promptKey: "unbekannt" }), null);
});

test("Variantenquelle verbindet mehrere Fragefelder und verlangt Frage und Antwort", () => {
  const content: NoteContent = createManualNoteContent({
    kind: "basic",
    front: "Hauptstadt von",
    back: "Paris",
    additionalFields: [{ id: "land", name: "Land", value: "Frankreich", placement: "front" }, { id: "info", name: "Info", value: "Seine", placement: "back" }],
  });
  const { note, cards } = createNote({ deckId: "deck", content });
  assert.deepEqual(cardVariantSource(note, cards[0]), { front: "Hauptstadt von Frankreich", back: "Paris" });
  const imageOnly = createBasicNote("deck", '<img src="bild.png">', "Antwort");
  assert.equal(cardVariantSource(imageOnly.note, imageOnly.cards[0]), null);
});

test("Lückentext und Auswahl liefern keine Variantenquelle und sind nicht geeignet", () => {
  const cloze = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "cloze", front: "{{c1::ATP}} speichert Energie", back: "" }) });
  const choice = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "single-choice", front: "Frage?", back: "", answerOptions: ["A", "B"], correctOptionIndices: [0] }) });
  for (const { note, cards } of [cloze, choice]) {
    assert.equal(cardVariantSource(note, cards[0]), null);
    const eligibility = classifyCardEligibility(note, cards[0]);
    assert.equal(eligibility.eligible, false);
    assert.deepEqual(eligibility.blockedTransforms, ["rephrase"]);
    assert.equal(eligibility.cardId, cards[0].id);
  }
});

test("Eignung hängt vom CoRe-Modus und vollständiger Frage und Antwort ab", () => {
  const { note, cards } = createBasicNote("deck", "Frage", "Antwort");
  assert.deepEqual(classifyCardEligibility(note, cards[0]), { eligible: true, reasons: [], blockedTransforms: [], cardId: cards[0].id });
  const off = classifyCardEligibility(note, cards[0], { coreMode: "off" });
  assert.equal(off.eligible, false);
  assert.match(off.reasons[0], /ausgeschaltet/);
  const empty = createBasicNote("deck", '<img src="bild.png">', "Antwort");
  assert.deepEqual(classifyCardEligibility(empty.note, empty.cards[0]).reasons, ["Frage oder Antwort fehlt."]);
});

test("Variantendarstellung ersetzt Frage und Antwort und behält Zusatzfelder, Tags und Lernstand", () => {
  const content = createManualNoteContent({
    kind: "basic",
    front: "Original-Frage",
    back: "Original-Antwort",
    tags: ["bio"],
    additionalFields: [{ id: "hint", name: "Hinweis", value: "Vorne", placement: "front" }, { id: "info", name: "Info", value: "Quelle", placement: "back" }],
  });
  const { note, cards } = createNote({ deckId: "deck", content });
  const card = addCardVariant(cards[0], { id: "variant-1", front: "<b>Neue Frage</b>", back: "Neue Antwort" });
  const variant = card.variants[0];
  const presented = variantPresentation(note, card, variant);

  assert.deepEqual(presented.note.content.fields.map((field) => [field.id, field.role, field.html]), [
    ["variant-front", "prompt", "<b>Neue Frage</b>"],
    ["variant-back", "answer", "Neue Antwort"],
    ["info", "extra", "Quelle"],
  ]);
  assert.deepEqual(presented.note.content.interaction, {
    kind: "reveal",
    prompts: [{ key: "forward", name: "Variante", instruction: "", questionFieldIds: ["variant-front"], answerFieldIds: ["variant-back"], requires: null, typeInFieldId: null }],
  });
  assert.deepEqual(presented.note.content.tags, ["bio"]);
  assert.equal(presented.note.id, note.id);
  assert.equal(presented.card.id, "variant-1");
  assert.equal(presented.card.promptKey, "forward");
  assert.equal(presented.card.study, card.study);
  assert.equal(presented.card.noteId, card.noteId);
  assert.equal(note.content.fields[0].html, "Original-Frage");
});
