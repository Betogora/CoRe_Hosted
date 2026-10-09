import assert from "node:assert/strict";
import test from "node:test";
import type { NoteContent, NoteField, RevealPrompt } from "../coreTypes.ts";
import { clozeOrdinals, deriveNotePromptKeys, noteContentMediaRefs, parseNoteContent } from "./noteContent.ts";

function field(id: string, role: NoteField["role"], html: string, name = id): NoteField {
  return { id, name, role, html };
}

function prompt(key: string, questionFieldIds: string[], answerFieldIds: string[], extra: Partial<RevealPrompt> = {}): RevealPrompt {
  return { key, name: key, instruction: "", questionFieldIds, answerFieldIds, requires: null, typeInFieldId: null, ...extra };
}

function note(fields: NoteField[], interaction: NoteContent["interaction"], extra: Partial<NoteContent> = {}): NoteContent {
  return { schemaVersion: 1, fields, interaction, speech: [], tags: [], ...extra };
}

function parsed(input: unknown) {
  const result = parseNoteContent(input);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("\n"));
  return result as Extract<typeof result, { ok: true }>;
}

function rejected(input: unknown, pattern: RegExp) {
  const result = parseNoteContent(input);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.errors.some((error) => pattern.test(error)), !result.ok ? result.errors.join("\n") : "");
}

const front = field("front", "prompt", "Welches Hormon senkt den Blutzucker?", "Vorderseite");
const back = field("back", "answer", "Insulin", "Rückseite");

test("Anki-Basic ist ein Inhalt mit einer Vorwärtsabfrage", () => {
  assert.deepEqual(parsed(note([front, back], { kind: "reveal", prompts: [prompt("forward", ["front"], ["back"])] })).promptKeys, ["forward"]);
});

test("Basic und umgekehrt sowie optional umgekehrt sind Abfragelisten mit Bedingung", () => {
  const reverse = prompt("reverse", ["back"], ["front"]);
  assert.deepEqual(parsed(note([front, back], { kind: "reveal", prompts: [prompt("forward", ["front"], ["back"]), reverse] })).promptKeys, ["forward", "reverse"]);

  const flag = field("add-reverse", "note", "", "Umgekehrt hinzufügen");
  const optional = (flagHtml: string) => note([front, back, { ...flag, html: flagHtml }], {
    kind: "reveal",
    prompts: [prompt("forward", ["front"], ["back"]), { ...reverse, requires: { mode: "all", fieldIds: ["add-reverse"] } }],
  });
  assert.deepEqual(parsed(optional("")).promptKeys, ["forward"]);
  assert.deepEqual(parsed(optional("ja")).promptKeys, ["forward", "reverse"]);
});

test("Antwort eintippen ist eine Eigenschaft der Abfrage", () => {
  const value = parsed(note([front, back], { kind: "reveal", prompts: [prompt("forward", ["front"], ["back"], { typeInFieldId: "back" })] })).value;
  assert.equal(value.interaction.kind === "reveal" && value.interaction.prompts[0].typeInFieldId, "back");
});

test("Notiztypen mit mehr als zwei Richtungen behalten jede Abfrage und ihre Anweisung", () => {
  const word = field("word", "prompt", "der Hund", "Wort");
  const meaning = field("meaning", "answer", "dog", "Bedeutung");
  const audio = field("audio", "hint", "[sound:hund.mp3]", "Audio");
  const result = parsed(note([word, meaning, audio], {
    kind: "reveal",
    prompts: [
      prompt("anki-0", ["word"], ["meaning"], { instruction: "Was bedeutet …?" }),
      prompt("anki-1", ["meaning"], ["word"], { instruction: "Wie heißt das auf Deutsch?" }),
      prompt("anki-2", ["audio"], ["word", "meaning"], { instruction: "Was hörst du?", requires: { mode: "any", fieldIds: ["audio"] } }),
    ],
  }));
  assert.deepEqual(result.promptKeys, ["anki-0", "anki-1", "anki-2"]);
  assert.equal(result.value.interaction.kind === "reveal" && result.value.interaction.prompts[1].instruction, "Wie heißt das auf Deutsch?");
  assert.deepEqual(noteContentMediaRefs(result.value), ["hund.mp3"]);
});

test("Eine Abfrage mit leerer Vorderseite erzeugt wie in Anki keine Karte", () => {
  const empty = { ...back, html: "<br>&nbsp;" };
  assert.deepEqual(parsed(note([front, empty], { kind: "reveal", prompts: [prompt("forward", ["front"], ["back"]), prompt("reverse", ["back"], ["front"])] })).promptKeys, ["forward"]);
  rejected(note([{ ...front, html: "" }, back], { kind: "reveal", prompts: [prompt("forward", ["front"], ["back"])] }), /keine Karte/);
  assert.deepEqual(deriveNotePromptKeys(note([field("image", "prompt", '<img src="herz.png">'), back], { kind: "reveal", prompts: [prompt("forward", ["image"], ["back"])] })), ["forward"]);
});

test("Lückentext erzeugt eine Karte je Lückennummer, auch verschachtelt und mehrfach nummeriert", () => {
  const text = field("text", "prompt", "{{c1::Insulin}} senkt, {{c2::Glukagon::Hormon}} hebt den {{c1,3::Blutzucker}}; {{c4::außen {{c5::innen}} außen}}.", "Text");
  const result = parsed(note([text, field("extra", "extra", "Pankreas", "Extra")], { kind: "cloze" }));
  assert.deepEqual(result.promptKeys, ["cloze:1", "cloze:2", "cloze:3", "cloze:4", "cloze:5"]);
  assert.deepEqual(clozeOrdinals("{{c2::a}} {{c10::b}} {{c2::c}}"), [2, 10]);
  assert.equal(clozeOrdinals("{{c1::offen"), null);
  rejected(note([{ ...text, html: "{{c1::offen" }], { kind: "cloze" }), /nicht geschlossene Lücke/);
  rejected(note([{ ...text, html: "Ohne Lücke" }], { kind: "cloze" }), /keine Karte/);
  rejected(note([{ ...text, role: "extra" }], { kind: "cloze" }), /Rolle Frage/);
});

test("AnKing-artige Inhalte tragen Hinweise, Zusatz und Quellen als Feldrollen", () => {
  const result = parsed(note([
    field("text", "prompt", "{{c1::Troponin}} steigt nach 3–4 h.", "Text"),
    field("extra", "extra", "Herzinfarkt-Diagnostik", "Extra"),
    field("lecture", "hint", "Vorlesung Kardiologie", "Lecture Notes"),
    field("amboss", "source", '<a href="https://next.amboss.com/de/article/abc">AMBOSS</a>', "AMBOSS"),
  ], { kind: "cloze" }, { tags: ["#Kardio", "Labor", "Labor"] }));
  assert.deepEqual(result.promptKeys, ["cloze:1"]);
  assert.deepEqual(result.value.tags, ["#Kardio", "Labor"]);
  assert.match(result.value.fields[3].html, /href="https:\/\/next\.amboss\.com\/de\/article\/abc"/);
});

test("Auswahlfragen prüfen Modus und richtige Antworten", () => {
  const options = (correct: boolean[]) => correct.map((value, index) => ({ id: `o${index}`, html: `Option ${index + 1}`, correct: value }));
  const question = field("question", "prompt", "Welche Aussagen stimmen?", "Frage");
  assert.deepEqual(parsed(note([question], { kind: "choice", mode: "single", options: options([true, false, false]) })).promptKeys, ["choice"]);
  parsed(note([question], { kind: "choice", mode: "multiple", options: options([true, true, false]) }));
  parsed(note([question], { kind: "choice", mode: "kprim", options: options([true, true, true, true]) }));
  rejected(note([question], { kind: "choice", mode: "single", options: options([true, true]) }), /genau eine richtige/);
  rejected(note([question], { kind: "choice", mode: "multiple", options: options([true, true]) }), /eine falsche/);
  rejected(note([question], { kind: "choice", mode: "kprim", options: options([true, false, true]) }), /genau vier/);
});

test("Bildverdeckung erzeugt eine Karte je Maskengruppe und verweist auf ihr Bild", () => {
  const rect = { kind: "rect" as const, left: 0.1, top: 0.2, width: 0.3, height: 0.1, angle: 0 };
  const result = parsed(note([field("header", "prompt", "Herzklappen", "Überschrift")], {
    kind: "image-occlusion",
    image: "herz.png",
    mode: "hide-all-guess-one",
    masks: [
      { id: "m1", ordinal: 2, shape: rect, alwaysOccluded: false },
      { id: "m2", ordinal: 1, shape: { kind: "polygon", points: [[0, 0], [0.5, 0], [0.5, 0.5]] }, alwaysOccluded: false },
      { id: "m3", ordinal: 2, shape: { kind: "ellipse", left: 0.5, top: 0.5, width: 0.2, height: 0.2, angle: 15 }, alwaysOccluded: true },
    ],
  }));
  assert.deepEqual(result.promptKeys, ["io:1", "io:2"]);
  assert.deepEqual(noteContentMediaRefs(result.value), ["herz.png"]);
  const header = [field("header", "prompt", "Herzklappen")];
  const mask = { id: "m", ordinal: 1, shape: rect, alwaysOccluded: false };
  rejected(note(header, { kind: "image-occlusion", image: "https://example.com/x.png", mode: "hide-one-guess-one", masks: [mask] }), /lokales Bild/);
  rejected(note(header, { kind: "image-occlusion", image: "herz.png", mode: "hide-one-guess-one", masks: [{ ...mask, shape: { ...rect, width: 2 } }] }), /zwischen 0 und 1/);
  rejected(note(header, { kind: "image-occlusion", image: "herz.png", mode: "hide-one-guess-one", masks: [{ ...mask, ordinal: 0 }] }), /Gruppennummer/);
  const overlay = { ...mask, shape: { kind: "overlay" as const, question: "maske-q.svg", answer: "maske-a.svg" } };
  assert.deepEqual(noteContentMediaRefs(parsed(note(header, { kind: "image-occlusion", image: "herz.png", mode: "hide-one-guess-one", masks: [overlay] })).value), ["herz.png", "maske-a.svg", "maske-q.svg"]);
  rejected(note(header, { kind: "image-occlusion", image: "herz.png", mode: "hide-one-guess-one", masks: [{ ...overlay, shape: { ...overlay.shape, question: "https://example.com/q.svg" } }] }), /lokale Maskenbilder/);
});

test("Feld-HTML wird nach dem Inhaltsvertrag bereinigt und Medien werden gesammelt", () => {
  const result = parsed(note([
    field("front", "prompt", '<p style="font-family:Arial;color:#c00;position:absolute">Rot</p><img src="a.png" onerror="x()"><script>alert(1)</script>'),
    field("back", "answer", '<img src="https://tracker.example/p.png">[sound:b.mp3]<img src="data:image/png;base64,AAAA"><img src="c&amp;d.png">'),
  ], { kind: "reveal", prompts: [prompt("forward", ["front"], ["back"])] }));
  assert.equal(result.value.fields[0].html, '<p style="color:#c00">Rot</p><img src="a.png" />');
  assert.doesNotMatch(result.value.fields[1].html, /tracker/);
  assert.deepEqual(noteContentMediaRefs(result.value), ["a.png", "b.mp3", "c&d.png"]);
});

test("Strukturfehler werden mit deutschen Meldungen abgewiesen", () => {
  rejected({ schemaVersion: 2, fields: [front], interaction: { kind: "cloze" } }, /Version/);
  rejected(note([front, { ...back, id: "front" }], { kind: "reveal", prompts: [prompt("forward", ["front"], ["back"])] }), /Feld-IDs/);
  rejected(note([front, { ...back, name: "VORDERSEITE" }], { kind: "reveal", prompts: [prompt("forward", ["front"], ["back"])] }), /Feldnamen/);
  rejected(note([front, back], { kind: "reveal", prompts: [prompt("Vorwärts!", ["front"], ["back"])] }), /Schlüssel/);
  rejected(note([front, back], { kind: "reveal", prompts: [prompt("forward", ["missing"], ["back"])] }), /unbekannte Feld/);
  rejected(note([front, back], { kind: "reveal", prompts: [prompt("forward", ["front"], ["back"]), prompt("forward", ["back"], ["front"])] }), /eindeutig/);
  rejected(note([front, back], { kind: "flashcard" } as never), /Abfrageart/);
  rejected(note([front, back], { kind: "reveal", prompts: [prompt("forward", ["front"], ["back"])] }, { speech: [{ fieldId: "front", language: "Deutsch" }] }), /Sprache/);
});
