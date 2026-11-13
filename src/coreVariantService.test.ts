import assert from "node:assert/strict";
import test from "node:test";
import { addCardVariant, createBasicNote, createManualNoteContent, createNote } from "./coreModel.ts";
import { createAiCardVariantRequest } from "./aiCardVariantContract.ts";
import {
  cardVariantSource,
  classifyCardEligibility,
  deactivateVariant,
  deleteVariant,
  describeVariantReadiness,
  editVariantText,
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
  assert.deepEqual(cardVariantSource(note, forward), { kind: "basic", front: "Was ist ATP genau?", back: "Energieträger" });
  assert.deepEqual(cardVariantSource(note, reverse), { kind: "basic", front: "Energieträger", back: "Was ist ATP genau?" });
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
  assert.deepEqual(cardVariantSource(note, cards[0]), { kind: "basic", front: "Hauptstadt von Frankreich", back: "Paris" });
  const typed = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "basic", front: "Symbol für Gold?", back: "Au", typeIn: true }) });
  assert.deepEqual(cardVariantSource(typed.note, typed.cards[0]), { kind: "type-in", front: "Symbol für Gold?", back: "Au" });
  const imageOnly = createBasicNote("deck", '<img src="bild.png">', "Antwort");
  assert.equal(cardVariantSource(imageOnly.note, imageOnly.cards[0]), null);
});

test("Auswahl liefert keine Variantenquelle und ist nicht geeignet", () => {
  const { note, cards } = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "single-choice", front: "Frage?", back: "", answerOptions: ["A", "B"], correctOptionIndices: [0] }) });
  assert.equal(cardVariantSource(note, cards[0]), null);
  assert.deepEqual(classifyCardEligibility(note, cards[0]).reasons, ["Varianten gibt es nur für Frage–Antwort- und Lückentextkarten."]);
});

test("Lückentext-Quelle behält nur die eigene Lückengruppe; andere Lücken werden Text, verschachtelte eigene Lücken haben keine Quelle", () => {
  const cloze = (text: string) => createNote({ deckId: "deck", content: createManualNoteContent({ kind: "cloze", front: text, back: "Pankreas" }) });
  const hormones = cloze("<p>{{c1::Insulin}} senkt, {{c2::Glukagon::Hormon}} hebt den {{c1,3::Blutzucker}}.</p>");
  const [first, second, third] = hormones.cards;
  assert.deepEqual(cardVariantSource(hormones.note, first), { kind: "cloze", front: "{{c1::Insulin}} senkt, Glukagon hebt den {{c1::Blutzucker}}.", back: "Insulin · Blutzucker" });
  assert.deepEqual(cardVariantSource(hormones.note, second), { kind: "cloze", front: "Insulin senkt, {{c2::Glukagon::Hormon}} hebt den Blutzucker.", back: "Glukagon" });
  assert.deepEqual(cardVariantSource(hormones.note, third), { kind: "cloze", front: "Insulin senkt, Glukagon hebt den {{c3::Blutzucker}}.", back: "Blutzucker" });

  const nested = cloze("Die {{c1::Aortenklappe liegt {{c2::links}} vom Sternum}}.");
  assert.deepEqual(cardVariantSource(nested.note, nested.cards[0]), { kind: "cloze", front: "Die {{c1::Aortenklappe liegt links vom Sternum}}.", back: "Aortenklappe liegt links vom Sternum" });
  assert.deepEqual(cardVariantSource(nested.note, nested.cards[1]), { kind: "cloze", front: "Die Aortenklappe liegt {{c2::links}} vom Sternum.", back: "links" });
  const selfNested = cloze("{{c1::außen {{c1::innen}}}}");
  assert.equal(cardVariantSource(selfNested.note, selfNested.cards[0]), null);
  assert.deepEqual(classifyCardEligibility(selfNested.note, selfNested.cards[0]).reasons, ["Die Lücke dieser Karte ist leer oder verschachtelt."]);
  assert.equal(classifyCardEligibility(hormones.note, first).eligible, true);
});

test("Lückentext-Variante wird als Lückentext derselben Lückengruppe mit Zusatz der Karte gezeigt", () => {
  const { note, cards } = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "cloze", front: "{{c1::Insulin}} senkt, {{c2::Glukagon}} hebt den Blutzucker.", back: "Pankreas" }) });
  const card = addCardVariant(cards[1], { id: "variant-1", front: "Den Blutzucker hebt {{c2::Glukagon}}, Insulin senkt ihn.", back: "Glukagon" });
  const presented = variantPresentation(note, card, card.variants[0]);

  assert.deepEqual(presented.note.content.interaction, { kind: "cloze" });
  assert.deepEqual(presented.note.content.fields.map((field) => [field.role, field.html]), [["prompt", "Den Blutzucker hebt {{c2::Glukagon}}, Insulin senkt ihn."], ["extra", "Pankreas"]]);
  assert.equal(presented.card.promptKey, "cloze:2");
  assert.equal(presented.card.id, "variant-1");
  const imported = variantPresentation({ ...note, noteTypeSourceId: "type-1", translator: { id: "generic", version: 1 } }, card, card.variants[0]);
  assert.equal(imported.note.noteTypeSourceId, null, "eine Variante hat keine Felder des importierten Layouts");
});

test("Lückentext-Quelle mit Vergleichszeichen ohne Leerzeichen wird nicht erneut als HTML gelesen; Bearbeiten behält Leerzeichen vor Satzzeichen", () => {
  const compare = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "cloze", front: "wenn x&lt;y und y&gt;z dann {{c1::w}}", back: "" }) });
  assert.equal(createAiCardVariantRequest(cardVariantSource(compare.note, compare.cards[0])).source.front, "wenn x<y und y>z dann {{c1::w}}");

  const ratio = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "cloze", front: "Das Verhältnis ist {{c1::3 : 1}}.", back: "" }) });
  const card = addCardVariant(ratio.cards[0], { front: "Es gilt das Verhältnis {{c1::3 : 1}}.", back: "3 : 1" });
  const edited = editVariantText(card, card.variants[0].id, { front: "<p>Als Verhältnis gilt {{c1::3 : 1}}.</p>", back: "" }, "2026-10-30T12:00:00.000Z", cardVariantSource(ratio.note, card));
  assert.equal(edited.variants[0].back, "3 : 1");
});

test("Eine bearbeitete Lückentext-Variante braucht die Lücke der Karte mit derselben Lösung; die Antwort bleibt die der Karte", () => {
  const { note, cards } = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "cloze", front: "Die {{c1::Titanic}} sank 1912.", back: "" }) });
  const card = addCardVariant(cards[0], { front: "Im Jahr 1912 ging die {{c1::Titanic}} unter.", back: "Titanic" });
  const source = cardVariantSource(note, card);
  const edit = (front: string) => editVariantText(card, card.variants[0].id, { front, back: "egal" }, "2026-10-30T12:00:00.000Z", source);

  const edited = edit("<p>1912 sank die {{c1::Titanic}} im Nordatlantik.</p>");
  assert.equal(edited.variants[0].back, "Titanic");
  assert.throws(() => edit("1912 sank die {{c1::Lusitania}}."), /derselben Lösung/);
  assert.throws(() => edit("1912 sank die {{c2::Titanic}}."), /derselben Lösung/);
  assert.throws(() => edit("1912 sank die Titanic."), /derselben Lösung/);
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

test("Eintippen-Variante fragt neu und vergleicht mit dem Antwortfeld der Karte; vorgelesen wird nur Unverändertes", () => {
  const content = createManualNoteContent({
    kind: "basic",
    front: "Symbol für Gold?",
    back: "Au",
    typeIn: true,
    additionalFields: [{ id: "tipp", name: "Tipp", value: "Lateinisch aurum", role: "hint" }],
  });
  content.speech = [{ fieldId: "front", language: "de_DE" }, { fieldId: "back", language: "de_DE" }, { fieldId: "tipp", language: "de_DE" }];
  const { note, cards } = createNote({ deckId: "deck", content });
  const card = addCardVariant(cards[0], { id: "variant-1", front: "Welches Elementsymbol hat Gold?", back: "Gold hat das Symbol Au" });
  const presented = variantPresentation(note, card, card.variants[0]).note.content;

  assert.deepEqual(presented.fields.map((field) => [field.id, field.role, field.html]), [
    ["variant-front", "prompt", "Welches Elementsymbol hat Gold?"],
    ["back", "answer", "Au"],
    ["tipp", "hint", "Lateinisch aurum"],
  ]);
  assert.equal(presented.interaction.kind === "reveal" && presented.interaction.prompts[0].typeInFieldId, "back");
  assert.deepEqual(presented.speech.map((entry) => entry.fieldId), ["back", "tipp"]);

  const flipped = createNote({ deckId: "deck", content: { ...content, interaction: { kind: "reveal", prompts: [{ key: "forward", name: "Vorwärts", instruction: "", questionFieldIds: ["front"], answerFieldIds: ["back"], requires: null, typeInFieldId: null }] } } });
  const flippedCard = addCardVariant(flipped.cards[0], { id: "variant-2", front: "Elementsymbol von Gold?", back: "Au (aurum)" });
  assert.deepEqual(variantPresentation(flipped.note, flippedCard, flippedCard.variants[0]).note.content.speech.map((entry) => entry.fieldId), ["tipp"]);
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
  const reported = { ...card, variants: [{ ...variant, isActive: false, qualityStatus: "flagged" as const, feedback: [{ id: "feedback-1", type: "fachlich_falsch" as const, note: "", createdAt: "2026-10-12T09:00:00.000Z" }], revision: variant.revision + 1 }] };
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
