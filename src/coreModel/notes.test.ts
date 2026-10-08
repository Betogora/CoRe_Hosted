import assert from "node:assert/strict";
import test from "node:test";
import type { Card, NoteContent, RevealPrompt } from "../coreTypes.ts";
import { createCardVariant } from "./cards.ts";
import { createNote, planNoteContentChange, planNoteDeletion } from "./notes.ts";

const CREATED_AT = "2026-10-06T10:00:00.000Z";
const CHANGED_AT = "2026-10-06T11:00:00.000Z";

function content(interaction: NoteContent["interaction"], front = "Frage"): NoteContent {
  return {
    schemaVersion: 1,
    fields: [
      { id: "front", name: "Frage", role: "prompt", html: front },
      { id: "back", name: "Antwort", role: "answer", html: "Antwort" },
    ],
    interaction,
    speech: [],
    tags: [],
  };
}

function prompt(key: string, requires: RevealPrompt["requires"] = null): RevealPrompt {
  return { key, name: key, instruction: "", questionFieldIds: ["front"], answerFieldIds: ["back"], requires, typeInFieldId: null };
}

function reveal(reverse = false): NoteContent {
  return content({ kind: "reveal", prompts: [prompt("forward"), ...(reverse ? [{ ...prompt("reverse"), questionFieldIds: ["back"], answerFieldIds: ["front"] }] : [])] });
}

function cloze(text: string): NoteContent {
  return content({ kind: "cloze" }, text);
}

function create(value: unknown) {
  return createNote({ content: value, deckId: "deck-a", createdAt: CREATED_AT });
}

function keys(cards: Card[]) {
  return cards.map((card) => card.promptKey);
}

test("Erstellung validiert und bereinigt den Inhalt einmal für alle Karten", () => {
  const input = reveal(true);
  input.fields[0].html = '<b>Frage</b><script>alert(1)</script>';
  input.tags = ["Tag", "Tag"];
  const before = structuredClone(input);
  const { note, cards } = createNote({
    id: "note-import", content: input, deckId: "deck-a", createdAt: CREATED_AT,
    userId: "account", source: "anki-apkg", ankiGuid: "guid",
    noteTypeSourceId: "source", translator: { id: "basic", version: 1 },
  });
  assert.equal(note.id, "note-import");
  assert.equal(note.content.fields[0].html, "<b>Frage</b>");
  assert.deepEqual(note.content.tags, ["Tag"]);
  assert.equal(note.userId, "account");
  assert.equal(note.source, "anki-apkg");
  assert.equal(note.ankiGuid, "guid");
  assert.equal(note.noteTypeSourceId, "source");
  assert.deepEqual(note.translator, { id: "basic", version: 1 });
  assert.equal(note.marked, false);
  assert.equal(note.contentRevision, 1);
  assert.equal(note.importedContentRevision, 1);
  assert.equal(create(reveal()).note.importedContentRevision, null);
  assert.equal(note.revision, 1);
  assert.equal(note.createdAt, CREATED_AT);
  assert.equal(note.updatedAt, CREATED_AT);
  assert.equal(note.deletedAt, null);
  assert.equal(note.updatedByDeviceId, null);
  assert.deepEqual(keys(cards), ["forward", "reverse"]);
  assert.equal(new Set(cards.map((card) => card.id)).size, 2);
  for (const card of cards) {
    assert.match(card.id, /^card_/);
    assert.equal(card.noteId, note.id);
    assert.equal(card.deckId, "deck-a");
    assert.equal(card.ankiCardId, null);
    assert.equal(card.updatedByDeviceId, null);
    assert.equal(card.status, "active");
    assert.equal(card.ankiFlag, 0);
    assert.deepEqual(card.variants, []);
    assert.equal(card.study.state, "new");
    assert.equal(card.study.dueAt, CREATED_AT);
    assert.equal(card.study.reps, 0);
    assert.equal(card.study.stability, 0);
    assert.equal(card.study.difficulty, 5);
    assert.equal(card.study.extra.maturityXp, 0);
    assert.equal(card.study.extra.fallbackUntilCorrect, false);
  }
  cards[0].study.reps = 5;
  cards[0].study.extra.maturityXp = 120;
  assert.equal(cards[1].study.reps, 0);
  assert.equal(cards[1].study.extra.maturityXp, 0);
  assert.deepEqual(input, before);
});

test("Manuelle Inhalte erhalten frische Identitäten und keine Anki-Metadaten", () => {
  const first = create(reveal());
  const second = create(reveal());
  assert.notEqual(first.note.id, second.note.id);
  assert.notEqual(first.cards[0].id, second.cards[0].id);
  assert.equal(first.note.source, "manual");
  assert.equal(first.note.ankiGuid, null);
  assert.equal(first.note.noteTypeSourceId, null);
  assert.equal(first.note.translator, null);
});

test("Erstellung leitet bedingte Abfragen einschließlich Eintippen und leerer Rückrichtung ab", () => {
  const value = reveal(true);
  value.fields.push({ id: "flag", name: "Rückrichtung", role: "note", html: "" });
  assert.equal(value.interaction.kind, "reveal");
  if (value.interaction.kind !== "reveal") return;
  value.interaction.prompts[0].typeInFieldId = "back";
  value.interaction.prompts[1].requires = { mode: "all", fieldIds: ["flag"] };
  assert.deepEqual(keys(create(value).cards), ["forward"]);
  value.fields[2].html = "ja";
  assert.deepEqual(keys(create(value).cards), ["forward", "reverse"]);
  value.fields[1].html = "<br>&nbsp;";
  assert.deepEqual(keys(create(value).cards), ["forward"]);
});

test("Lücken mit Hinweisen, Mehrfachnummern, Verschachtelung, mehreren Feldern und Formeln ergeben eindeutige Karten", () => {
  const value = cloze("{{c1,2::Insulin::Hormon}} {{c4::außen {{c3::innen}}}} {{c1::}} ");
  value.fields.push({ id: "formula", name: "Formel", role: "prompt", html: "\\({{c5::x^2}} + {{c2::y::Hinweis: Wert}}\\)" });
  assert.deepEqual(keys(create(value).cards), ["cloze:1", "cloze:2", "cloze:3", "cloze:4", "cloze:5"]);
});

for (const mode of ["single", "multiple", "kprim"] as const) {
  test(`Auswahl ${mode} erzeugt genau eine planbare Karte`, () => {
    const options = [true, false, mode !== "single", false].map((correct, index) => ({ id: `o${index}`, html: `Aussage ${index}`, correct }));
    assert.deepEqual(keys(create(content({ kind: "choice", mode, options })).cards), ["choice"]);
  });
}

test("Bildverdeckung erzeugt eine Karte je Maskengruppe in beiden Verdeckungsmodi", () => {
  for (const mode of ["hide-all-guess-one", "hide-one-guess-one"] as const) {
    const masks = [2, 1, 2].map((ordinal, index) => ({
      id: `m${index}`, ordinal, alwaysOccluded: index === 2,
      shape: { kind: "rect" as const, left: 0, top: 0, width: 0.2, height: 0.2, angle: 0 },
    }));
    assert.deepEqual(keys(create(content({ kind: "image-occlusion", image: "bild.png", mode, masks })).cards), ["io:1", "io:2"]);
  }
});

test("Erstellung und Änderung weisen ungültige oder kartenlose Inhalte zurück", () => {
  assert.throws(() => create({}), /Version/);
  assert.throws(() => create(cloze("{{c1::offen")), /nicht geschlossene Lücke/);
  const previous = create(cloze("{{c1::eins}}"));
  const before = structuredClone(previous);
  assert.throws(() => planNoteContentChange(previous, cloze("Ohne Lücke"), CHANGED_AT), /keine Karte/);
  assert.throws(() => planNoteContentChange({ note: previous.note, cards: [] }, cloze("{{c1::eins}}"), CHANGED_AT), /keine Karte zugeordnet/);
  assert.deepEqual(previous, before);
});

for (const scenario of [
  { name: "Lücke hinzufügen", next: "{{c1::eins}} {{c2::zwei}} {{c3::drei}}", kept: ["cloze:1", "cloze:2"], added: ["cloze:3"], removed: [] },
  { name: "Lücke entfernen", next: "{{c1::eins}} zwei", kept: ["cloze:1"], added: [], removed: ["cloze:2"] },
  { name: "Lücke umnummerieren", next: "{{c1::eins}} {{c3::drei}}", kept: ["cloze:1"], added: ["cloze:3"], removed: ["cloze:2"] },
]) {
  test(`Änderungsplanung: ${scenario.name} bewahrt Lernstand und meldet entfallende Karten`, () => {
    const previous = create(cloze("{{c1::eins}} {{c2::zwei}}"));
    previous.note.contentRevision = 4;
    previous.note.marked = true;
    previous.cards[0].study.state = "review";
    previous.cards[0].study.reps = 12;
    previous.cards[0].study.stability = 33;
    previous.cards[0].study.extra.forcedVariantId = "variant";
    previous.cards[0].status = "suspended";
    previous.cards[0].ankiFlag = 3;
    previous.cards[0].ankiCardId = "anki-1";
    previous.cards[0].variants = [createCardVariant({ cardId: previous.cards[0].id, front: "Variante", back: "Antwort" })];
    previous.cards[1].deckId = "deck-b";
    const before = structuredClone(previous);
    const plan = planNoteContentChange(previous, cloze(scenario.next), CHANGED_AT);
    assert.equal(plan.changed, true);
    assert.deepEqual(keys(plan.keptCards), scenario.kept);
    assert.deepEqual(keys(plan.newCards), scenario.added);
    assert.deepEqual(keys(plan.removedCards), scenario.removed);
    for (const card of [...plan.keptCards, ...plan.removedCards]) {
      assert.equal(card, previous.cards.find((old) => old.id === card.id));
      assert.equal(card.deletedAt, null);
    }
    for (const card of plan.newCards) {
      assert.equal(card.noteId, previous.note.id);
      assert.equal(card.deckId, "deck-a");
      assert.equal(card.study.state, "new");
      assert.equal(card.study.dueAt, CHANGED_AT);
      assert.ok(!previous.cards.some((old) => old.id === card.id));
    }
    assert.equal(plan.note.contentRevision, 5);
    assert.equal(plan.note.marked, true);
    assert.equal(plan.note.revision, previous.note.revision + 1);
    assert.equal(plan.note.updatedAt, CHANGED_AT);
    assert.equal(plan.note.createdAt, CREATED_AT);
    assert.deepEqual(previous, before);
  });
}

test("Rückrichtung lässt sich zuschalten und wird beim Abschalten nur zur Entfernung vorgemerkt", () => {
  const previous = create(reveal());
  const enabled = planNoteContentChange(previous, reveal(true), CHANGED_AT);
  assert.deepEqual(keys(enabled.keptCards), ["forward"]);
  assert.deepEqual(keys(enabled.newCards), ["reverse"]);
  const disabled = planNoteContentChange({ note: enabled.note, cards: [...enabled.keptCards, ...enabled.newCards] }, reveal(), CHANGED_AT);
  assert.deepEqual(keys(disabled.removedCards), ["reverse"]);
  assert.equal(disabled.removedCards[0], enabled.newCards[0]);
});

test("Ein geleertes Bedingungsfeld entfernt nur die davon abhängige Abfrage", () => {
  const value = content({ kind: "reveal", prompts: [prompt("forward"), prompt("conditional", { mode: "any", fieldIds: ["back"] })] });
  const previous = create(value);
  const next = structuredClone(value);
  next.fields[1].html = "";
  const plan = planNoteContentChange(previous, next, CHANGED_AT);
  assert.deepEqual(keys(plan.keptCards), ["forward"]);
  assert.deepEqual(keys(plan.removedCards), ["conditional"]);
  assert.deepEqual(plan.newCards, []);
});

test("Formatierung und Abfragereihenfolge ändern keine Kartenidentität oder Lernstände", () => {
  const previous = create(reveal(true));
  const next = reveal(true);
  next.fields[0].html = "<b>Frage</b>";
  if (next.interaction.kind === "reveal") next.interaction.prompts.reverse();
  const plan = planNoteContentChange(previous, next, CHANGED_AT);
  assert.deepEqual(keys(plan.keptCards), ["reverse", "forward"]);
  assert.deepEqual(plan.keptCards, [...previous.cards].reverse());
  assert.deepEqual(plan.newCards, []);
  assert.deepEqual(plan.removedCards, []);
});

test("Löschplanung betrifft Inhalt und alle Geschwister mit einem Zeitstempel; Undo enthält den vollständigen vorherigen Zustand", () => {
  const previous = create(cloze("{{c1::eins}} {{c2::zwei}}"));
  previous.cards[1].deckId = "deck-b";
  previous.cards[1].status = "suspended";
  previous.cards[1].study.state = "review";
  previous.cards[1].study.reps = 8;
  previous.cards[1].variants = [createCardVariant({ cardId: previous.cards[1].id, front: "Variante", back: "Antwort" })];
  const before = structuredClone(previous);
  const plan = planNoteDeletion(previous.note, previous.cards, CHANGED_AT);
  assert.equal(plan.note.deletedAt, CHANGED_AT);
  assert.equal(plan.note.updatedAt, CHANGED_AT);
  assert.equal(plan.note.contentRevision, previous.note.contentRevision);
  assert.equal(plan.note.revision, previous.note.revision + 1);
  for (const card of plan.cards) {
    const old = previous.cards.find((candidate) => candidate.id === card.id)!;
    assert.deepEqual(card, { ...old, deletedAt: CHANGED_AT, updatedAt: CHANGED_AT, revision: old.revision + 1 });
  }
  assert.deepEqual(plan.undo, before);
  assert.deepEqual(previous, before);
});

test("Änderung und Löschung lehnen Karten eines fremden Inhalts ab", () => {
  const previous = create(reveal());
  const foreign = create(reveal());
  assert.throws(() => planNoteContentChange({ note: previous.note, cards: foreign.cards }, reveal(), CHANGED_AT), /anderen Inhalt/);
  assert.throws(() => planNoteDeletion(previous.note, [...previous.cards, ...foreign.cards], CHANGED_AT), /anderen Inhalt/);
});

test("Speichern ohne inhaltliche Änderung erhöht keine Revision und behält alle Karten", () => {
  const previous = create(reveal(true));
  const next = reveal(true);
  next.fields[0].html = "Frage<script>alert(1)</script>";
  next.tags = ["", ""];
  const before = structuredClone(previous);
  const plan = planNoteContentChange(JSON.parse(JSON.stringify(previous)), next, CHANGED_AT);
  assert.equal(plan.changed, false);
  assert.deepEqual(plan.note, before.note);
  assert.deepEqual(plan.keptCards, before.cards);
  assert.deepEqual(plan.newCards, []);
  assert.deepEqual(plan.removedCards, []);
  const reordered = { note: { ...previous.note, content: { tags: [], speech: [], interaction: previous.note.content.interaction, fields: previous.note.content.fields, schemaVersion: 1 } as typeof previous.note.content }, cards: previous.cards };
  assert.equal(planNoteContentChange(reordered, reveal(true), CHANGED_AT).changed, false);
});

test("Neue Karten landen unabhängig von der übergebenen Reihenfolge im Stapel der ersten bisherigen Abfrage", () => {
  const previous = create(cloze("{{c1::eins}} {{c2::zwei}}"));
  previous.cards[0].deckId = "deck-first";
  previous.cards[1].deckId = "deck-second";
  for (const cards of [previous.cards, [...previous.cards].reverse()]) {
    const plan = planNoteContentChange({ note: previous.note, cards }, cloze("{{c1::eins}} {{c2::zwei}} {{c3::drei}}"), CHANGED_AT);
    assert.deepEqual(plan.newCards.map((card) => card.deckId), ["deck-first"]);
  }
});

test("Änderung und Löschung lehnen doppelte Karten oder Abfrageschlüssel ab", () => {
  const previous = create(cloze("{{c1::eins}} {{c2::zwei}}"));
  const duplicateKey = [previous.cards[0], { ...previous.cards[1], promptKey: "cloze:1" }];
  assert.throws(() => planNoteContentChange({ note: previous.note, cards: duplicateKey }, cloze("{{c1::eins}}"), CHANGED_AT), /Abfrageschlüssel ist mehrfach/);
  assert.throws(() => planNoteDeletion(previous.note, [...previous.cards, previous.cards[0]], CHANGED_AT), /mehrfach übergeben/);
});

test("Änderungsplanung lehnt gelöschte Inhalte und Karten ab", () => {
  const previous = create(cloze("{{c1::eins}} {{c2::zwei}}"));
  const deleted = planNoteDeletion(previous.note, previous.cards, CHANGED_AT);
  assert.throws(() => planNoteContentChange(deleted, cloze("{{c1::eins}}"), CHANGED_AT), /Gelöschte/);
  const oneDeleted = [previous.cards[0], { ...previous.cards[1], deletedAt: CHANGED_AT }];
  assert.throws(() => planNoteContentChange({ note: previous.note, cards: oneDeleted }, cloze("{{c1::eins}}"), CHANGED_AT), /Gelöschte/);
});
