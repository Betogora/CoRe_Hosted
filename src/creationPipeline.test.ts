import assert from "node:assert/strict";
import test from "node:test";
import { addCardVariant, createManualNoteContent, createNote, validateManualNoteInput, type ManualNoteInput } from "./coreModel.ts";
import type { NoteInteraction } from "./coreTypes.ts";
import { createCreationWorkflow } from "./creationWorkflow.ts";

const CREATED_AT = "2026-10-08T08:00:00.000Z";

function manual(input: Partial<ManualNoteInput> & Pick<ManualNoteInput, "kind">): ManualNoteInput {
  return { front: "", back: "", ...input };
}

function create(input: ManualNoteInput) {
  return createNote({ deckId: "deck", content: createManualNoteContent(input), createdAt: CREATED_AT });
}

function reveal(interaction: NoteInteraction): Extract<NoteInteraction, { kind: "reveal" }> {
  assert.equal(interaction.kind, "reveal");
  return interaction as Extract<NoteInteraction, { kind: "reveal" }>;
}

test("eine Basic-Karte besitzt ihren Lernstatus direkt und keine Variante", () => {
  const { note, cards } = create(manual({ kind: "basic", front: "Frage", back: "Antwort" }));

  assert.deepEqual(cards.map((card) => card.promptKey), ["forward"]);
  assert.equal(cards[0].noteId, note.id);
  assert.equal(cards[0].study.state, "new");
  assert.equal(cards[0].study.dueAt, CREATED_AT);
  assert.equal(cards[0].studyRevision, 0);
  assert.deepEqual(cards[0].variants, []);
  assert.deepEqual(note.content.fields.map((field) => [field.id, field.name, field.role]), [["front", "Vorderseite", "prompt"], ["back", "Rückseite", "answer"]]);
});

test("Basic mit Rückseite erzeugt zwei unabhängige Karten aus einem Inhalt", () => {
  const { note, cards } = create(manual({ kind: "basic-reversed", front: "Vorne", back: "Hinten" }));
  const prompts = reveal(note.content.interaction).prompts;

  assert.deepEqual(cards.map((card) => card.promptKey), ["forward", "reverse"]);
  assert.notEqual(cards[0].id, cards[1].id);
  assert.notEqual(cards[0].study, cards[1].study);
  assert.deepEqual(prompts.map((prompt) => [prompt.key, prompt.name, prompt.questionFieldIds, prompt.answerFieldIds]), [
    ["forward", "Vorwärts", ["front"], ["back"]],
    ["reverse", "Rückwärts", ["back"], ["front"]],
  ]);
});

test("jede Cloze-Gruppe wird zu einer eigenen Karte; die Rückseite bleibt Zusatzinfo", () => {
  const input = manual({ kind: "cloze", front: "{{c1::Berlin}} und {{c2::Paris}}, noch einmal {{c1::Berlin}}", back: "Europa" });
  assert.deepEqual(validateManualNoteInput(input), {});
  const { note, cards } = create(input);

  assert.deepEqual(cards.map((card) => card.promptKey), ["cloze:1", "cloze:2"]);
  assert.equal(note.content.interaction.kind, "cloze");
  assert.deepEqual(note.content.fields.map((field) => [field.id, field.name, field.role]), [["front", "Text", "prompt"], ["back", "Zusatzinfo", "extra"]]);
});

test("Single und Multiple Choice ergeben je eine Auswahlkarte mit maskierten Optionen", () => {
  const single = create(manual({ kind: "single-choice", front: "Welche Stadt?", back: "Erklärung", answerOptions: [" Berlin ", "<b>Paris</b>"], correctOptionIndices: [1] }));
  const multiple = create(manual({ kind: "multiple-choice", front: "Welche?", answerOptions: ["A", "B", "C"], correctOptionIndices: [0, 2] }));

  assert.deepEqual(single.cards.map((card) => card.promptKey), ["choice"]);
  assert.equal(single.note.content.interaction.kind, "choice");
  if (single.note.content.interaction.kind !== "choice") return;
  assert.equal(single.note.content.interaction.mode, "single");
  assert.deepEqual(single.note.content.interaction.options.map((option) => [option.id, option.html, option.correct]), [
    ["option-1", "Berlin", false],
    ["option-2", "&lt;b&gt;Paris&lt;/b&gt;", true],
  ]);
  assert.deepEqual(single.note.content.fields.map((field) => [field.name, field.role]), [["Frage", "prompt"], ["Erklärung", "extra"]]);
  assert.equal(multiple.note.content.interaction.kind === "choice" && multiple.note.content.interaction.mode, "multiple");
  assert.deepEqual(multiple.cards.map((card) => card.promptKey), ["choice"]);
});

test("Zusatzfelder ergänzen die Frage oder werden Zusatzinfo und erhalten eindeutige IDs", () => {
  const { note, cards } = create(manual({
    kind: "basic-reversed",
    front: "Hund",
    back: "dog",
    additionalFields: [
      { id: "front", name: "Hinweis", value: "Haustier", placement: "front" },
      { name: "Beispiel", value: "The dog barks.", placement: "back" },
      { id: "both field", name: " Merkhilfe ", value: "bellt", placement: "both" },
      { id: "leer", name: "  ", value: "verworfen" },
    ],
  }));
  const prompts = reveal(note.content.interaction).prompts;

  assert.deepEqual(note.content.fields.map((field) => [field.id, field.name, field.role]), [
    ["front", "Vorderseite", "prompt"],
    ["back", "Rückseite", "answer"],
    ["front-2", "Hinweis", "prompt"],
    ["field-2", "Beispiel", "extra"],
    ["both-field", "Merkhilfe", "prompt"],
  ]);
  assert.deepEqual(prompts[0].questionFieldIds, ["front", "front-2", "both-field"]);
  assert.deepEqual(prompts[1].answerFieldIds, ["front", "front-2", "both-field"]);
  assert.deepEqual(cards.map((card) => card.promptKey), ["forward", "reverse"]);
});

test("Schlagwörter werden getrimmt, ohne leere Einträge und Duplikate übernommen", () => {
  const fromList = createNote({ deckId: "deck", content: createManualNoteContent(manual({ kind: "basic", front: "F", back: "A", tags: ["Biologie", " Zelle ", "", "Zelle"] })) });
  const fromText = createManualNoteContent(manual({ kind: "basic", front: "F", back: "A", tags: "Biologie, Zelle;#Zelle" }));

  assert.deepEqual(fromList.note.content.tags, ["Biologie", "Zelle"]);
  assert.deepEqual(fromText.tags, ["Biologie", "Zelle"]);
});

test("Auswahlfragen prüfen Optionen und richtige Antworten mit deutschen Meldungen", () => {
  const base = { front: "Welche?", back: "" };

  assert.deepEqual(validateManualNoteInput({ kind: "single-choice", ...base, answerOptions: ["A", ""], correctOptionIndices: [0] }), {
    options: "Bitte mindestens zwei nichtleere Antwortoptionen eingeben.",
  });
  assert.deepEqual(validateManualNoteInput({ kind: "single-choice", ...base, answerOptions: ["Ja", "ja"], correctOptionIndices: [0, 1] }), {
    options: "Antwortoptionen müssen eindeutig sein.",
    correctOptions: "Bitte genau eine gültige richtige Antwort auswählen.",
  });
  assert.deepEqual(validateManualNoteInput({ kind: "multiple-choice", ...base, answerOptions: ["A", "B"], correctOptionIndices: [] }), {
    correctOptions: "Bitte mindestens eine gültige richtige Antwort auswählen.",
  });
  assert.deepEqual(validateManualNoteInput({ kind: "multiple-choice", ...base, answerOptions: ["A", "B"], correctOptionIndices: [0, 1] }), {
    correctOptions: "Bitte mindestens eine Antwortoption als falsch belassen.",
  });
  assert.deepEqual(validateManualNoteInput({ kind: "multiple-choice", front: "", back: "", answerOptions: ["A", "B"], correctOptionIndices: [5] }), {
    front: "Bitte eine Frage eingeben.",
    correctOptions: "Bitte mindestens eine gültige richtige Antwort auswählen.",
  });
  assert.deepEqual(validateManualNoteInput({ kind: "cloze", front: "", back: "" }), { front: "Bitte einen Cloze-Text eingeben." });
  assert.deepEqual(validateManualNoteInput({ kind: "cloze", front: "{{c1:: }}", back: "" }), { front: "Bitte gültige Lücken wie {{c1::Begriff}} verwenden." });
});

test("der Erstellungsablauf liefert Inhalt und Bildzuordnung, aus denen die Karten entstehen", async () => {
  const workflow = createCreationWorkflow();
  const image = await workflow.prepareManualImage(Object.assign(new Blob([new Uint8Array([9, 9])], { type: "image/png" }), { name: "zelle.png" }));
  const validation = workflow.validateManualCard({
    kind: "cloze",
    front: `<p>Die {{c1::Mitochondrien}} <img src="${image.sha1}"></p>`,
    back: "Zellorganellen",
    mediaAttachments: [image],
  });
  assert.equal(validation.ok, true);
  const { note, cards } = createNote({ deckId: "deck", content: validation.content, media: validation.media! });

  assert.deepEqual(cards.map((card) => card.promptKey), ["cloze:1"]);
  assert.deepEqual(note.media, { [image.sha1]: image.sha1 });
  assert.equal(note.source, "manual");
  assert.equal(note.importedContentRevision, null);
});

test("nur KI-Umformulierungen bleiben Varianten und besitzen keinen eigenen Lernstatus", () => {
  const { cards } = create(manual({ kind: "basic", front: "Frage", back: "Antwort" }));
  const updated = addCardVariant(cards[0], { front: "Neu gefragt", back: "Neu geantwortet" }, CREATED_AT);

  assert.equal(updated.variants.length, 1);
  assert.equal(updated.variants[0].cardId, cards[0].id);
  assert.equal("study" in updated.variants[0], false);
  assert.equal("reviewState" in updated.variants[0], false);
  assert.equal(updated.study, cards[0].study);
  assert.equal(updated.studyRevision, cards[0].studyRevision);
});
