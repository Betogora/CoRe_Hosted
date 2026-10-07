import assert from "node:assert/strict";
import test from "node:test";
import type { NoteContent, NoteField } from "./coreTypes.ts";
import { createNote } from "./coreModel/notes.ts";
import { compareTypedAnswer, evaluateNoteChoice, notePlainText, renderCard, renderNoteChoiceOptions, renderNoteSpeech, type NotePresentationTheme } from "./notePresentation.ts";

const theme: NotePresentationTheme = { mode: "light", colors: { surface: "#ffffff", "surface-muted": "#edf1f6", text: "#181d25", "text-muted": "#667492", border: "#d5dbe5", "border-interactive": "#6f7e9e", success: "#d6a3d2", "success-surface": "#f5e8f4", danger: "#e28b68", "danger-surface": "#f8e2d9", "learning-goal-achieved": "#2f7d68" } };
const field = (id: string, role: NoteField["role"], html: string): NoteField => ({ id, name: id, role, html });
function content(interaction: NoteContent["interaction"], fields = [field("front", "prompt", "Frage"), field("back", "answer", "Antwort")]): NoteContent {
  return { schemaVersion: 1, fields, interaction, tags: [], speech: [] };
}
const basic = () => content({ kind: "reveal", prompts: [{ key: "forward", name: "Vorwärts", instruction: "Beantworte die Frage", questionFieldIds: ["front"], answerFieldIds: ["back"], requires: null, typeInFieldId: null }] });
async function render(value: NoteContent, side: "question" | "answer", key?: string, surface: "review" | "preview" | "management" = "review") {
  const graph = createNote({ content: value, deckId: "deck" });
  return renderCard({ ...graph, card: graph.cards.find((card) => !key || card.promptKey === key)!, side, surface, theme });
}

test("Aufdecken ergänzt nur Antwort und genau eine Trennlinie; Vorschau enthält beide Seiten", async () => {
  const question = await render(basic(), "question");
  const answer = await render(basic(), "answer");
  const preview = await render(basic(), "answer", undefined, "preview");
  assert.match(question.accessibleText, /Beantworte die Frage.*Frage/);
  assert.doesNotMatch(answer.accessibleText, /Frage|Beantworte/);
  assert.equal((answer.srcdoc.match(/<hr\b/g) ?? []).length, 1);
  assert.match(preview.accessibleText, /Frage.*Antwort/);
  assert.equal((await render(basic(), "answer", undefined, "management")).accessibleText, preview.accessibleText);
});

test("Hinweise sind native Details; Zusatz und Quellen erscheinen nur nach Aufdecken, Notizfelder nie", async () => {
  const value = basic();
  value.fields.push(field("Hinweis", "hint", "Denke an Hormone"), field("Zusatz", "extra", "Pankreas"), field("Quelle", "source", '<a href="https://example.com">Literatur</a>'), field("Intern", "note", "Nur Editor"));
  const question = await render(value, "question");
  const answer = await render(value, "answer");
  assert.match(question.srcdoc, /<details><summary>Hinweis<\/summary>/);
  assert.doesNotMatch(question.accessibleText, /Pankreas|Literatur|Nur Editor/);
  assert.match(answer.srcdoc, /target="_blank" rel="noopener noreferrer"/);
  assert.match(answer.srcdoc, /<svg[^>]*aria-hidden="true"/);
  assert.match(answer.accessibleText, /Pankreas.*Literatur/);
  value.fields.splice(3, 2, field("Quelle", "source", '<a href="https://example.com">Literatur</a>'), field("Zusatz", "extra", "Pankreas"));
  const reordered = await render(value, "answer");
  assert.match(reordered.accessibleText, /Pankreas.*Literatur/);
  assert.match(reordered.srcdoc, /<div class="core-note-sources"><a class="core-source-link"/);
  assert.doesNotMatch(answer.accessibleText, /Nur Editor/);
});

test("Lücken werden verschachtelt und mehrfach nummeriert aufgelöst, Hinweise behalten Doppelpunkte", async () => {
  const value = content({ kind: "cloze" }, [field("Text", "prompt", "{{c1,3::Insulin::Hinweis: Hormon}} senkt {{c2::außen {{c4::innen}} außen}}; {{c5::}}.")]);
  assert.match((await render(value, "question", "cloze:3")).accessibleText, /\[Hinweis: Hormon\].*außen innen außen/);
  assert.match((await render(value, "question", "cloze:2")).accessibleText, /Insulin senkt \[…\]/);
  assert.match((await render(value, "question", "cloze:4")).accessibleText, /außen \[…\] außen/);
  const answer = await render(value, "answer", "cloze:3");
  assert.match(answer.srcdoc, /<mark[^>]*>Insulin<\/mark>/);
  assert.doesNotMatch(answer.srcdoc, /\{\{c|<hr\b/);
  assert.match((await render(value, "question", "cloze:5")).accessibleText, /; \[…\]\./);
  assert.match((await render(value, "answer", "cloze:5")).srcdoc, /<mark class="core-active-cloze"><\/mark>/);
});

test("Feldrollen gelten auch bei expliziten Abfragereferenzen und beim Vorlesen", async () => {
  const value = basic();
  value.fields.push(field("Zusatz", "extra", "Zusatztext"), field("Intern", "note", "Privater Text"), field("Hinweis", "hint", "Hinweistext"));
  if (value.interaction.kind !== "reveal") throw new Error("Test braucht eine Abfrage.");
  value.interaction.prompts[0].questionFieldIds.push("Zusatz", "Intern", "Hinweis");
  value.interaction.prompts[0].answerFieldIds.push("Intern");
  value.speech = value.fields.map((item) => ({ fieldId: item.id, language: "de-DE" }));
  const graph = createNote({ content: value, deckId: "deck" });
  const question = await render(value, "question");
  const answer = await render(value, "answer");
  assert.doesNotMatch(question.accessibleText, /Zusatztext|Privater/);
  assert.equal(question.accessibleText.match(/Hinweistext/g)?.length, 1);
  assert.doesNotMatch(answer.accessibleText, /Privater/);
  assert.deepEqual((await renderNoteSpeech(graph.note, graph.cards[0], "question", theme)).map((item) => item.fieldId), ["front", "Hinweis"]);
});

test("Bildmasken verdecken fremde Gruppen dauerhaft und decken die aktive Gruppe ohne Scripts auf", async () => {
  const shapes = [
    { kind: "rect" as const, left: .1, top: .1, width: .2, height: .2, angle: 10 },
    { kind: "ellipse" as const, left: .4, top: .2, width: .1, height: .2, angle: 0 },
    { kind: "polygon" as const, points: [[0, 0], [.1, .2], [.2, .1]] as Array<[number, number]>, angle: 0 },
    { kind: "text" as const, left: .1, top: .7, text: "Beschriftung", scale: .1, angle: 0 },
  ];
  for (const mode of ["hide-one-guess-one", "hide-all-guess-one"] as const) {
    const value = content({ kind: "image-occlusion", image: "bild.png", mode, masks: shapes.map((shape, index) => ({ id: String(index), ordinal: index === 0 ? 1 : 2, alwaysOccluded: index === 2, shape })) });
    const question = await render(value, "question", "io:1");
    const answer = await render(value, "answer", "io:1");
    assert.match(question.srcdoc, /viewBox="0 0 1 1"/);
    assert.match(question.srcdoc, /preserveAspectRatio="none"/);
    assert.match(answer.srcdoc, /class="mask-outline"/);
    assert.match(answer.srcdoc, /<polygon/);
    assert.match(question.srcdoc, /<span class="mask-label" style="left:10%;top:70%;font-size:0.1em;transform:rotate\(0deg\)">Beschriftung<\/span>/);
    assert.doesNotMatch(question.srcdoc, /<text\b/);
    assert.equal(/<ellipse/.test(question.srcdoc), mode === "hide-all-guess-one");
    assert.match((await render(value, "answer", "io:2")).srcdoc, /<polygon class="mask-outline"/);
  }
  const overlay = content({ kind: "image-occlusion", image: "bild.png", mode: "hide-one-guess-one", masks: [{ id: "m", ordinal: 1, alwaysOccluded: false, shape: { kind: "overlay", question: "q.svg", answer: "a.svg" } }] });
  assert.match((await render(overlay, "question", "io:1")).srcdoc, /<img class="mask-overlay" src="q\.svg" alt=""\/><\/div>/);
  assert.match((await render(overlay, "answer", "io:1")).srcdoc, /<img class="mask-overlay" src="a\.svg" alt=""\/><\/div>/);
});

test("Medien sind lokal auflösbar, MP4-Sound wird Video und TTS dupliziert keinen Feldtext", async () => {
  const value = basic();
  value.fields[0].html = '<img src="bild.png">[sound:ton.mp3][sound:film.mp4]Insulin';
  value.speech = [{ fieldId: "front", language: "de-DE" }];
  const result = await render(value, "question");
  assert.deepEqual(result.mediaReferences, ["bild.png", "film.mp4", "ton.mp3"]);
  assert.match(result.srcdoc, /<audio controls preload="none"/);
  assert.match(result.srcdoc, /<video controls preload="none"/);
  assert.equal((result.accessibleText.match(/Insulin/g) ?? []).length, 1);
  assert.ok(result.interactions.includes("tts"));
  assert.doesNotMatch(result.srcdoc, /<script|onerror=|onclick=/i);
  assert.match(result.srcdoc, /script-src 'none'/);
});

test("Formeln einschließlich Lücken und Anki-LaTeX werden vorgerendert; Fehler bleiben sichtbar", async () => {
  const value = content({ kind: "cloze" }, [field("Text", "prompt", "\\({{c1::\\frac{x}{y}}} + {{c2::z}}\\) [latex]x^2[/latex] [$]y^2[/$] [$$]z^2[/$$] \\[\\unknowncommand\\]")]);
  const question = await render(value, "question", "cloze:1");
  const answer = await render(value, "answer", "cloze:1");
  assert.match(question.srcdoc, /class="katex/);
  assert.match(answer.srcdoc, /class="katex/);
  assert.equal(question.diagnostics.filter((diagnostic) => diagnostic.code === "math-error").length, 1);
  assert.match(question.srcdoc, /<code[^>]*>.*unknowncommand/);
  assert.equal((question.srcdoc.match(/class="katex-display"/g) ?? []).length, 2);
  assert.doesNotMatch(question.accessibleText, /\[\/?\$/);
  assert.doesNotMatch(answer.srcdoc, /\{\{c/);
});

test("Zeichenvergleich unterscheidet richtige, falsche und fehlende Unicode-Zeichen", () => {
  assert.equal(notePlainText('<p>In<strong>sul</strong>in.</p><p>α<br>β</p>'), "Insulin. α β");
  assert.equal(compareTypedAnswer("Ärztin", "Ärztin").correct, true);
  const result = compareTypedAnswer("Herz", "Hertz");
  assert.equal(result.correct, false);
  assert.deepEqual(result.typed.filter((token) => token.kind === "wrong").map((token) => token.text), ["t"]);
  assert.deepEqual(compareTypedAnswer("Herz", "Her").expected.filter((token) => token.kind === "missing").map((token) => token.text), ["z"]);
  assert.equal(compareTypedAnswer("🫀", "🫀").typed.length, 1);
  assert.deepEqual(compareTypedAnswer("Herz", "Hart").expected.filter((token) => token.kind === "wrong").map((token) => token.text), ["e", "z"]);
});

test("Formeltext bleibt zugänglich ohne doppelte MathML-/HTML-Fassung; gefährliche Befehle werden diagnostiziert", async () => {
  const value = basic();
  value.fields[0].html = "\\(x\\)";
  assert.equal((await render(value, "question")).accessibleText.match(/\bx\b/g)?.length, 1);
  value.fields[0].html = "\\(\\href{javascript:alert(1)}{x}\\)";
  const result = await render(value, "question");
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "math-error"));
  assert.doesNotMatch(result.srcdoc, /href="javascript:/);
});

test("Formeldiagnosen der Rückseite bleiben bis zum Aufdecken verborgen", async () => {
  const value = basic();
  value.fields[1].html = "\\(\\unsupportedcommand\\)";
  assert.deepEqual((await render(value, "question")).diagnostics, []);
  assert.equal((await render(value, "answer")).diagnostics.length, 1);
});

test("Lücken in Formeln erhalten Sonderzeichen im Hinweis und escaped geschweifte Klammern", async () => {
  const value = content({ kind: "cloze" }, [field("Text", "prompt", "\\({{c1::\\{x::a_b & 10%}}\\)")]);
  const question = await render(value, "question", "cloze:1");
  const answer = await render(value, "answer", "cloze:1");
  assert.deepEqual(question.diagnostics, []);
  assert.deepEqual(answer.diagnostics, []);
  assert.match(question.accessibleText, /a_b.*10%/);
});

test("Vorlesen gibt weder aktive Lückenantworten noch interne Notizfelder preis", async () => {
  const value = content({ kind: "cloze" }, [field("Text", "prompt", "{{c1::Insulin}} senkt den Blutzucker."), field("Intern", "note", "Privater Text")]);
  value.speech = [{ fieldId: "Text", language: "de-DE" }, { fieldId: "Intern", language: "de-DE" }];
  const graph = createNote({ content: value, deckId: "deck" });
  const question = await renderNoteSpeech(graph.note, graph.cards[0], "question", theme);
  const answer = await renderNoteSpeech(graph.note, graph.cards[0], "answer", theme);
  assert.equal(question.length, 1);
  assert.doesNotMatch(question[0].text, /Insulin/);
  assert.match(answer[0].text, /Insulin/);
  value.fields[0].html = "\\({{c1::Insulin}} + \\unsupportedcommand\\)";
  const broken = createNote({ content: value, deckId: "deck" });
  const brokenQuestion = await renderCard({ note: broken.note, card: broken.cards[0], side: "question", surface: "review", theme });
  assert.doesNotMatch(brokenQuestion.accessibleText, /Insulin/);
});

test("Auswahloptionen erhalten denselben sicheren Formel- und Medienrenderer", async () => {
  const graph = createNote({ content: content({ kind: "choice", mode: "single", options: [{ id: "a", html: "\\(x^2\\)", correct: true }, { id: "b", html: '<img src="bild.png" onerror="alert(1)">', correct: false }] }), deckId: "deck" });
  const options = await renderNoteChoiceOptions(graph.note, theme);
  assert.match(options[0].html, /class="katex/);
  assert.match(options[1].html, /src="bild.png"/);
  assert.doesNotMatch(options[1].html, /onerror/);
});

test("Die Antwortseite ersetzt das Eingabefeld durch den Zeichenvergleich", async () => {
  const value = basic();
  if (value.interaction.kind !== "reveal") throw new Error("Test braucht eine Abfrage.");
  value.fields[1].html = "<b>Herz</b>";
  value.interaction.prompts[0].typeInFieldId = "back";
  const graph = createNote({ content: value, deckId: "deck" });
  const answer = (typedAnswer?: string) => renderCard({ ...graph, card: graph.cards[0], side: "answer", surface: "review", theme, typedAnswer });
  assert.match((await answer()).srcdoc, /<b>Herz<\/b>/);
  const wrong = await answer("Hertz");
  assert.doesNotMatch(wrong.srcdoc, /<b>Herz<\/b>/);
  assert.match(wrong.srcdoc, /data-correct="false"/);
  assert.match(wrong.srcdoc, /<span class="typed-wrong">t<\/span>/);
  assert.match(wrong.accessibleText, /Deine Antwort Hertz Richtig Herz/);
  const right = await answer("Herz");
  assert.match(right.srcdoc, /data-correct="true"/);
  assert.doesNotMatch(right.accessibleText, /Deine Antwort/);
  assert.match((await answer("")).accessibleText, /Keine Eingabe/);
});

test("Auswertung unterstützt Single, Multiple und vollständige Kprim-Antworten", () => {
  const options = [true, false, true, false].map((correct, index) => ({ id: String(index), html: `Aussage ${index}`, correct }));
  assert.equal(evaluateNoteChoice({ kind: "choice", mode: "multiple", options }, { 0: true, 2: true }).correct, true);
  assert.equal(evaluateNoteChoice({ kind: "choice", mode: "multiple", options }, { 0: true }).correct, false);
  assert.equal(evaluateNoteChoice({ kind: "choice", mode: "single", options: options.slice(0, 2) }, { 0: true }).correct, true);
  assert.equal(evaluateNoteChoice({ kind: "choice", mode: "kprim", options }, { 0: true, 1: false, 2: true, 3: false }).correct, true);
  assert.equal(evaluateNoteChoice({ kind: "choice", mode: "kprim", options }, { 0: true, 2: true }).complete, false);
});
