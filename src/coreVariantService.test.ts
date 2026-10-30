import assert from "node:assert/strict";
import test from "node:test";
import { addCardVariant, createBasicNote, createManualNoteContent, createNote } from "./coreModel.ts";
import {
  cardVariantSource,
  classifyCardEligibility,
  deactivateVariant,
  deleteVariant,
  describeVariantReadiness,
  editVariantText,
  flagVariant,
  isEditedVariant,
  reactivateVariant,
  selectReviewVariant,
  variantPresentation,
} from "./coreVariantService.ts";
import type { Card, NoteContent } from "./coreTypes.ts";

const ON = { coreMode: "on", variantThresholdDays: 21, maxActiveVariantsPerCard: 2 } as const;

/** A review card at the given learning level with two rephrasings created one after another. */
/** Stability 20 holds about 33 days until recall falls to 90 %, stability 10 about 13 days. */
function matureCard(stability = 20, reps = 0): Card {
  const { cards } = createBasicNote("deck", "Frage", "Antwort");
  const base: Card = { ...cards[0], study: { ...cards[0].study, state: "review", reps, stability, difficulty: 5, lastRating: "good", extra: { ...cards[0].study.extra, stabilityFast: stability } } };
  const first = addCardVariant(base, { id: "v1", front: "F1", back: "A" }, "2026-10-01T08:00:00.000Z");
  return addCardVariant(first, { id: "v2", front: "F2", back: "A" }, "2026-10-02T08:00:00.000Z");
}

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
    additionalFields: [{ id: "land", name: "Land", value: "Frankreich", role: "prompt" }, { id: "info", name: "Info", value: "Seine", role: "extra" }],
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
  }
});

test("Eignung hängt vom CoRe-Modus, vollständiger Frage und Antwort und der Variantenhöchstzahl ab", () => {
  const { note, cards } = createBasicNote("deck", "Frage", "Antwort");
  assert.deepEqual(classifyCardEligibility(note, cards[0]), { eligible: true, reasons: [] });
  const full = addCardVariant(addCardVariant(cards[0], { front: "F1", back: "A" }), { front: "F2", back: "A" });
  assert.match(classifyCardEligibility(note, full).reasons[0], /bereits 2 aktive Varianten/);
  assert.equal(classifyCardEligibility(note, full, { maxActiveVariantsPerCard: 3 }).eligible, true);
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
    additionalFields: [{ id: "hint", name: "Hinweis", value: "Vorne", role: "prompt" }, { id: "info", name: "Info", value: "Quelle", role: "extra" }],
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

test("Review wechselt reife Karten reihum zwischen Karte und Varianten ab", () => {
  assert.deepEqual([0, 1, 2, 3].map((reps) => selectReviewVariant(matureCard(20, reps), ON)?.id ?? null), [null, "v1", "v2", null]);
});

test("Review zeigt die Karte selbst bei ausgeschaltetem CoRe, unter der Lernstufe, in Lernphasen und nach einem Fehler", () => {
  const card = matureCard(20, 1);
  assert.equal(selectReviewVariant(card, { ...ON, coreMode: "off" }), null);
  assert.equal(selectReviewVariant(card, { ...ON, variantThresholdDays: 60 }), null);
  assert.equal(selectReviewVariant({ ...card, study: { ...card.study, state: "relearning" } }, ON), null);
  assert.equal(selectReviewVariant({ ...card, study: { ...card.study, lastRating: "again" } }, ON), null);
  assert.equal(selectReviewVariant(card, { ...ON, variantThresholdDays: 7 })?.id, "v1");
});

test("Review fragt höchstens so viele Varianten ab, wie der Stapel erlaubt", () => {
  assert.deepEqual([0, 1, 2].map((reps) => selectReviewVariant(matureCard(20, reps), { ...ON, maxActiveVariantsPerCard: 1 })?.id ?? null), [null, "v1", null]);
});

test("Bereitschaft nennt Lernstufe, Schwelle und Variantenzahl des Stapels", () => {
  assert.deepEqual(
    { ...describeVariantReadiness(matureCard(10), { variantThresholdDays: 21 }), reason: "" },
    { durabilityDays: 13, thresholdDays: 21, ready: false, reason: "", activeCount: 2, maxActive: 2 },
  );
  assert.equal(describeVariantReadiness(matureCard(20)).ready, true);
  assert.match(describeVariantReadiness(matureCard(20), { coreMode: "off" }).reason, /ausgeschaltet/);
});

test("reactivating a reported variant returns it to rotation with its feedback; outdated ones stay out; deleting leaves a tombstone", () => {
  const base = createBasicNote("deck", "Was ist ATP?", "Energieträger").cards[0];
  const card = addCardVariant(base, { front: "Wofür steht ATP?", back: "Energie" });
  const [variant] = card.variants;
  const reported = flagVariant(card, variant.id, "fachlich_falsch");
  const reactivated = reactivateVariant(reported, variant.id).variants[0];
  assert.equal(reactivated.isActive, true);
  assert.equal(reactivated.qualityStatus, "active");
  assert.equal(reactivated.feedback.length, 1, "der Meldeverlauf bleibt");
  assert.equal(reactivated.revision, variant.revision + 2);

  const outdated = { ...reported, variants: reported.variants.map((entry) => ({ ...entry, meta: { ...entry.meta, outdated: true } })) };
  assert.equal(reactivateVariant(outdated, variant.id).variants[0].isActive, false);

  const deleted = deleteVariant(card, variant.id, "2026-10-12T10:00:00.000Z").variants[0];
  assert.equal(deleted.deletedAt, "2026-10-12T10:00:00.000Z");
  assert.equal(deleted.isActive, false);
});

test("Variantentext bearbeiten: eigene Formulierung, nicht leer, nicht doppelt; Abschalten nimmt sie aus der Rotation", () => {
  const { cards } = createBasicNote("deck", "Frage", "Antwort");
  const withVariants = addCardVariant(addCardVariant(cards[0], { front: "Variante A", back: "Antwort" }), { front: "Variante B", back: "Antwort" });
  const [first, second] = withVariants.variants;

  const edited = editVariantText(withVariants, first.id, { front: "Eigene Frage", back: "Antwort" }, "2026-10-30T12:00:00.000Z");
  const editedVariant = edited.variants.find((variant) => variant.id === first.id)!;
  assert.deepEqual([editedVariant.front, editedVariant.revision, isEditedVariant(editedVariant), isEditedVariant(second)], ["Eigene Frage", first.revision + 1, true, false]);
  assert.notEqual(editedVariant.contentHash, first.contentHash);
  assert.equal(editVariantText(edited, first.id, { front: "Eigene Frage", back: "Antwort" }), edited, "unverändert bleibt dieselbe Karte");
  assert.throws(() => editVariantText(withVariants, first.id, { front: " ", back: "Antwort" }), /nicht leer/);
  assert.throws(() => editVariantText(withVariants, first.id, { front: "Variante B", back: "Antwort" }), /schon/);

  const disabled = deactivateVariant(edited, second.id).variants.find((variant) => variant.id === second.id)!;
  assert.deepEqual([disabled.isActive, disabled.qualityStatus], [false, "disabled"]);
});
