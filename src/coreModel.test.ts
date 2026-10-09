import assert from "node:assert/strict";
import test from "node:test";
import {
  addCardVariant,
  addNoteField,
  applyNoteEditorValue,
  canRemoveNoteField,
  noteBlocks,
  removeNoteField,
  setNoteReverse,
  setNoteTypeIn,
  cardStudyFromReviewState,
  createBasicNote,
  createCoreDeck,
  createDefaultDeckSettings,
  createManualNoteContent,
  createNote,
  createReviewState,
  duplicateNote,
  getActiveVariants,
  noteEditorValue,
  noteTextIndex,
  normalizeCoreDeck,
  planNoteContentChange,
  planNoteDeletion,
  planNoteRestore,
  rescheduleCard,
  setCardSuspended,
  setNoteMarked,
  validateManualNoteInput,
  validateNoteEditorValue,
} from "./coreModel.ts";
import type { ReviewSchedulerState } from "./coreTypes.ts";

test("deck settings normalize appearance defaults and fallbacks", () => {
  const defaults = createDefaultDeckSettings();
  const custom = createDefaultDeckSettings({ appearance: { iconKey: "brain", iconColor: "#ABCDEF" } });
  assert.deepEqual(defaults.appearance, { iconKey: "book-open", iconColor: "#6f7e9e" });
  assert.deepEqual(custom.appearance, { iconKey: "brain", iconColor: "#abcdef" });
});

test("manuelles Basic mit Rückseite erzeugt zwei volle Karten", () => {
  const deck = createCoreDeck({ name: "Biologie" });
  const { note, cards } = createNote({ deckId: deck.id, content: createManualNoteContent({ kind: "basic-reversed", front: "ATP", back: "Energieträger" }) });
  assert.deepEqual(cards.map((card) => card.promptKey), ["forward", "reverse"]);
  assert.ok(cards.every((card) => card.variants.length === 0 && card.deckId === deck.id && card.noteId === note.id));
  assert.equal(note.content.interaction.kind, "reveal");
  if (note.content.interaction.kind !== "reveal") return;
  const reverse = note.content.interaction.prompts.find((prompt) => prompt.key === "reverse");
  assert.deepEqual(reverse?.questionFieldIds, ["back"]);
  assert.equal(note.content.fields.find((field) => field.id === "back")?.html, "Energieträger");
});

test("Multiple Choice bleibt strukturierter Karteninhalt", () => {
  const { note, cards } = createNote({
    deckId: "deck",
    content: createManualNoteContent({ kind: "multiple-choice", front: "Welche?", back: "A und B", answerOptions: ["A", "B", "C"], correctOptionIndices: [0, 1] }),
  });
  assert.deepEqual(cards.map((card) => card.promptKey), ["choice"]);
  assert.equal(note.content.interaction.kind, "choice");
  if (note.content.interaction.kind !== "choice") return;
  assert.equal(note.content.interaction.mode, "multiple");
  assert.deepEqual(note.content.interaction.options.map((option) => [option.html, option.correct]), [["A", true], ["B", true], ["C", false]]);
});

test("Kartenänderungen erzeugen keinen wiederherstellbaren Verlauf", () => {
  const previous = createBasicNote("deck", "Alt", "Antwort");
  const value = noteEditorValue(previous.note);
  const validation = validateNoteEditorValue(previous.note, { ...value, fields: { ...value.fields, front: "Neu" } });
  assert.equal(validation.ok, true);
  const plan = planNoteContentChange(previous, validation.content, "2026-08-21T10:00:00.000Z");
  assert.equal(plan.changed, true);
  assert.equal(plan.note.content.fields.find((field) => field.id === "front")?.html, "Neu");
  assert.equal(plan.note.contentRevision, 2);
  assert.deepEqual(plan.keptCards, previous.cards);
  assert.deepEqual(applyNoteEditorValue(previous.note.content, value), previous.note.content);
});

test("Neuplanung ändert in allen Phasen nur dueAt, updatedAt und studyRevision", () => {
  for (const phase of ["new", "learning", "relearning", "review"] as ReviewSchedulerState[]) {
    const [created] = createBasicNote("deck", phase, "A").cards;
    const card = {
      ...created,
      study: cardStudyFromReviewState(createReviewState({ state: phase, dueAt: "2026-08-20T04:00:00.000Z", reps: 4, stability: 12, difficulty: 5 })),
    };
    const before = structuredClone(card.study);
    const updated = rescheduleCard(card, "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z");
    assert.deepEqual({ ...updated.study, dueAt: before.dueAt }, before);
    assert.equal(updated.study.dueAt, "2026-08-24T04:00:00.000Z");
    assert.equal(updated.updatedAt, "2026-08-21T10:00:00.000Z");
    assert.equal(updated.studyRevision, card.studyRevision + 1);
    assert.equal(updated.revision, card.revision);
    assert.equal(updated.status, card.status);
    assert.deepEqual(updated.variants, card.variants);
  }
});

test("identischer Termin ist ein No-op", () => {
  const [card] = createBasicNote("deck", "Q", "A", { createdAt: "2026-08-24T04:00:00.000Z" }).cards;
  assert.equal(rescheduleCard(card, card.study.dueAt, "2026-08-21T10:00:00.000Z"), card);
});

test("Neuplanung lehnt ungültige und vergangene Termine ab", () => {
  const [card] = createBasicNote("deck", "Q", "A", { createdAt: "2026-08-20T04:00:00.000Z" }).cards;
  assert.throws(() => rescheduleCard(card, "kein Datum", "2026-08-21T10:00:00.000Z"), /ungültig/);
  assert.throws(() => rescheduleCard(card, "2026-08-21T09:00:00.000Z", "2026-08-21T10:00:00.000Z"), /Zukunft/);
});

test("Normalisierung erhält Sync-Metadaten und KI-Varianten", () => {
  const [base] = createBasicNote("other-deck", "Q", "A").cards;
  const card = addCardVariant(base, { id: "variant", front: "Q2", back: "A2" });
  const deck = normalizeCoreDeck({ id: "deck", revision: 8, updatedByDeviceId: "device-a", cards: [{ ...card, revision: 5 }] });
  assert.equal(deck.revision, 8);
  assert.equal(deck.updatedByDeviceId, "device-a");
  assert.equal(deck.cards[0].revision, 5);
  assert.equal(deck.cards[0].deckId, "deck");
  assert.equal(deck.cards[0].variants[0].cardId, deck.cards[0].id);
  assert.equal(getActiveVariants(deck.cards[0]).length, 1);
});

test("manuelle Eingaben werden mit deutschen Feldmeldungen geprüft", () => {
  assert.deepEqual(validateManualNoteInput({ kind: "basic", front: "<p><br></p>", back: "" }), {
    front: "Bitte eine Vorderseite eingeben.",
    back: "Bitte eine Rückseite eingeben.",
  });
  assert.deepEqual(validateManualNoteInput({ kind: "cloze", front: "Ohne Lücke", back: "" }), { front: "Bitte gültige Lücken wie {{c1::Begriff}} verwenden." });
  assert.deepEqual(validateManualNoteInput({ kind: "cloze", front: "{{c1::ATP}}", back: "" }), {});
  assert.deepEqual(validateManualNoteInput({ kind: "single-choice", front: "Frage", back: "", answerOptions: ["A", "a"], correctOptionIndices: [0] }), { options: "Antwortoptionen müssen eindeutig sein." });
  assert.deepEqual(validateManualNoteInput({ kind: "multiple-choice", front: "Frage", back: "", answerOptions: ["A", "B"], correctOptionIndices: [0, 1] }), { correctOptions: "Bitte mindestens eine Antwortoption als falsch belassen." });
});

test("Editorprüfung meldet leere Pflichtfelder manueller Inhalte und doppelte Optionen", () => {
  const basic = createBasicNote("deck", "Frage", "Antwort");
  const value = noteEditorValue(basic.note);
  const empty = validateNoteEditorValue(basic.note, { ...value, fields: { ...value.fields, back: "" } });
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.errors, { back: "Bitte eine Rückseite eingeben." });

  const choice = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "single-choice", front: "Frage", back: "", answerOptions: ["A", "B"], correctOptionIndices: [0] }) });
  const choiceValue = noteEditorValue(choice.note);
  assert.deepEqual(choiceValue.options?.map((option) => [option.text, option.correct]), [["A", true], ["B", false]]);
  const duplicate = validateNoteEditorValue(choice.note, { ...choiceValue, options: choiceValue.options!.map((option) => ({ ...option, text: "B" })) });
  assert.deepEqual(duplicate.errors, { options: "Antwortoptionen müssen eindeutig sein." });
  const unchanged = validateNoteEditorValue(choice.note, choiceValue);
  assert.equal(unchanged.ok, true);
  assert.deepEqual(unchanged.content, choice.note.content);
});

test("Markierung gehört zum Inhalt und ändert keine Inhaltsrevision", () => {
  const { note } = createBasicNote("deck", "Q", "A");
  const marked = setNoteMarked(note, true, "2026-08-21T10:00:00.000Z");
  assert.equal(marked.marked, true);
  assert.equal(marked.revision, note.revision + 1);
  assert.equal(marked.contentRevision, note.contentRevision);
  assert.equal(marked.updatedAt, "2026-08-21T10:00:00.000Z");
  assert.equal(setNoteMarked(marked, true), marked);
});

test("Aussetzen behält Lernstand und Fälligkeit und erhöht nur die Kartenrevision", () => {
  const [card] = createBasicNote("deck", "Q", "A").cards;
  const suspended = setCardSuspended(card, true, "2026-08-21T10:00:00.000Z");
  assert.equal(suspended.status, "suspended");
  assert.equal(suspended.revision, card.revision + 1);
  assert.equal(suspended.studyRevision, card.studyRevision);
  assert.equal(suspended.study, card.study);
  assert.equal(setCardSuspended(suspended, true), suspended);
  assert.equal(setCardSuspended(suspended, false, "2026-08-22T10:00:00.000Z").status, "active");
});

test("Duplizieren erzeugt frische Karten in den Stapeln der Originalabfragen", () => {
  const original = createBasicNote("deck-a", "Frage", "Antwort", { reverse: true });
  original.cards[1] = { ...original.cards[1], deckId: "deck-b", study: { ...original.cards[1].study, reps: 7 } };
  const copy = duplicateNote(original.note, original.cards, "2026-08-21T10:00:00.000Z");
  assert.notEqual(copy.note.id, original.note.id);
  assert.equal(copy.note.source, "manual");
  assert.equal(copy.note.content.fields[0].html, "Frage<p>(Kopie)</p>");
  assert.deepEqual(copy.cards.map((card) => [card.promptKey, card.deckId, card.study.reps, card.noteId]), [
    ["forward", "deck-a", 0, copy.note.id],
    ["reverse", "deck-b", 0, copy.note.id],
  ]);
  assert.equal(duplicateNote(copy.note, copy.cards).note.content.fields[0].html, "Frage<p>(Kopie)</p>");
});

test("Wiederherstellen setzt Inhalt und Karten fort statt Revisionen zurückzudrehen", () => {
  const original = createBasicNote("deck", "Frage", "Antwort", { reverse: true });
  const deletion = planNoteDeletion(original.note, original.cards, "2026-08-21T10:00:00.000Z");
  const restored = planNoteRestore(deletion.undo, deletion, "2026-08-21T11:00:00.000Z");
  assert.equal(restored.note.deletedAt, null);
  assert.equal(restored.note.revision, deletion.note.revision + 1);
  assert.equal(restored.note.updatedAt, "2026-08-21T11:00:00.000Z");
  assert.deepEqual(restored.cards.map((card) => [card.id, card.deletedAt, card.revision]), deletion.cards.map((card) => [card.id, null, card.revision + 1]));
});

test("Textindex durchsucht Felder, Lücken, Optionen und Tags und sortiert nach der ersten Frage", () => {
  const cloze = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "cloze", front: "<b>{{c1::ATP}}</b> speichert&nbsp;Energie", back: "Zusatz", tags: ["Bio"] }) });
  assert.deepEqual(noteTextIndex(cloze.note.content), { searchText: "atp speichert energie zusatz bio", sortText: "ATP speichert Energie" });
  const choice = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "single-choice", front: "Frage", back: "", answerOptions: ["Mitochondrium", "Kern"], correctOptionIndices: [0] }) });
  assert.match(noteTextIndex(choice.note.content).searchText, /mitochondrium kern/);
});

test("Bausteine: Rückrichtung, Eintippen und Felder ändern den Inhalt so, dass die Karten folgen", () => {
  const basic = createBasicNote("deck", "Was ist ATP?", "Energieträger");
  assert.deepEqual(noteBlocks(basic.note.content), { reverse: false, typeIn: false, fieldRoles: ["prompt", "hint", "extra", "source"] });

  const reversed = setNoteReverse(basic.note.content, true);
  const plan = planNoteContentChange(basic, reversed);
  assert.deepEqual(plan.newCards.map((card) => card.promptKey), ["reverse"]);
  assert.deepEqual(planNoteContentChange({ note: plan.note, cards: [...plan.keptCards, ...plan.newCards] }, setNoteReverse(reversed, false)).removedCards.map((card) => card.promptKey), ["reverse"]);

  const typed = setNoteTypeIn(reversed, true);
  assert.ok(typed.interaction.kind === "reveal");
  assert.equal(typed.interaction.prompts.find((prompt) => prompt.key === "forward")?.typeInFieldId, "back");

  const { content: withQuestion, fieldId } = addNoteField(reversed, "prompt");
  assert.ok(withQuestion.interaction.kind === "reveal");
  assert.deepEqual(withQuestion.interaction.prompts.map((prompt) => [prompt.key, prompt.questionFieldIds, prompt.answerFieldIds]), [
    ["forward", ["front", fieldId], ["back"]],
    ["reverse", ["back"], ["front", fieldId]],
  ]);
  assert.equal(withQuestion.fields.at(-1)?.name, "Zusatzfrage");
  assert.equal(canRemoveNoteField(withQuestion, "front"), true, "die Zusatzfrage trägt die Frage weiter");
  assert.equal(canRemoveNoteField(withQuestion, "back"), false);
  const removed = removeNoteField(withQuestion, fieldId);
  assert.deepEqual(removed.interaction, reversed.interaction);

  const { content: withHint } = addNoteField(basic.note.content, "hint");
  assert.equal(withHint.fields.at(-1)?.role, "hint");
  assert.equal(planNoteContentChange(basic, withHint).newCards.length, 0);

  const cloze = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "cloze", front: "{{c1::ATP}} speichert Energie.", back: "" }) });
  assert.deepEqual(noteBlocks(cloze.note.content), { reverse: null, typeIn: null, fieldRoles: ["prompt", "hint", "extra", "source"] });
  assert.equal(canRemoveNoteField(cloze.note.content, "front"), false);
  assert.equal(setNoteReverse(cloze.note.content, true), cloze.note.content);
});
