import assert from "node:assert/strict";
import test from "node:test";
import type { NoteTypeSource } from "./apkgNoteTranslation.ts";
import type { NoteContent, NoteField, OcclusionShape } from "./coreTypes.ts";
import { createNote } from "./coreModel/notes.ts";
import { colorContrast } from "./ui/colorMath.ts";
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

test("Eine Quelle mit bloßer Webadresse wird zum Link mit dem Feldnamen, andere Quellen bleiben Text", async () => {
  const value = basic();
  value.fields.push(field("AMBOSS-Link", "source", "https://next.amboss.com/de/article/x"), field("Quelle", "source", "Lehrbuch, S. 3"));
  const answer = await render(value, "answer");
  assert.match(answer.srcdoc, /<a class="core-source-link" href="https:\/\/next\.amboss\.com\/de\/article\/x" target="_blank" rel="noopener noreferrer">AMBOSS-Link<svg/);
  assert.match(answer.srcdoc, /<h3>Quelle<\/h3>Lehrbuch, S\. 3/);
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
  const shapes: OcclusionShape[] = [
    { kind: "rect", left: .1, top: .1, width: .2, height: .2, angle: 10 },
    { kind: "ellipse", left: .4, top: .2, width: .1, height: .2, angle: 0 },
    { kind: "polygon", points: [[0, 0], [.1, .2], [.2, .1]] },
    { kind: "text", left: .1, top: .7, text: "Beschriftung", scale: .1, fontSize: null, angle: 0 },
  ];
  for (const mode of ["hide-one-guess-one", "hide-all-guess-one"] as const) {
    const value = content({ kind: "image-occlusion", image: "bild.png", mode, masks: shapes.map((shape, index) => ({ id: String(index), ordinal: index === 0 ? 1 : 2, alwaysOccluded: index === 2, shape })) });
    const question = await render(value, "question", "io:1");
    const answer = await render(value, "answer", "io:1");
    assert.match(question.srcdoc, /viewBox="0 0 1 1"/);
    assert.match(question.srcdoc, /preserveAspectRatio="none"/);
    assert.match(answer.srcdoc, /class="mask mask-rect mask-outline"/);
    assert.match(answer.srcdoc, /<polygon/);
    assert.match(question.srcdoc, /<span class="mask-label" style="left:10%;top:70%;font-size:0.1em;transform:rotate\(0deg\)">Beschriftung<\/span>/);
    assert.doesNotMatch(question.srcdoc, /<text\b/);
    assert.equal(/class="mask mask-ellipse/.test(question.srcdoc), mode === "hide-all-guess-one");
    assert.match((await render(value, "answer", "io:2")).srcdoc, /<polygon class="mask-outline"/);
  }
  const overlay = content({ kind: "image-occlusion", image: "bild.png", mode: "hide-one-guess-one", masks: [{ id: "m", ordinal: 1, alwaysOccluded: false, shape: { kind: "overlay", question: "q.svg", answer: "a.svg" } }] });
  // Anki turns rectangles, ellipses and labels in image pixels around their top-left corner and sizes labels by the
  // image height, so neither may depend on the stretched 0–1 mask space of a non-square image.
  const rotated = content({ kind: "image-occlusion", image: "bild.png", mode: "hide-all-guess-one", masks: [
    { id: "r", ordinal: 1, alwaysOccluded: false, shape: { kind: "rect", left: .35, top: .08, width: .2, height: .16, angle: 30 } },
    { id: "e", ordinal: 0, alwaysOccluded: true, shape: { kind: "ellipse", left: .66, top: .06, width: .16, height: .24, angle: 45 } },
    { id: "t", ordinal: 1, alwaysOccluded: false, shape: { kind: "text", left: .58, top: .62, text: "Mitralklappe", scale: 1.5, fontSize: .08, angle: 15 } },
  ] });
  const rotatedQuestion = (await render(rotated, "question", "io:1")).srcdoc;
  assert.match(rotatedQuestion, /<span class="mask mask-rect mask-target" style="left:35%;top:8%;width:20%;height:16%;transform:rotate\(30deg\)"><\/span>/);
  assert.match(rotatedQuestion, /<span class="mask mask-ellipse mask-muted" style="left:66%;top:6%;width:16%;height:24%;transform:rotate\(45deg\)"><\/span>/);
  assert.match(rotatedQuestion, /font-size:12cqh;transform:rotate\(15deg\)">Mitralklappe/);
  assert.match(rotatedQuestion, /\.mask\{position:absolute;box-sizing:border-box;transform-origin:0 0\}/);
  assert.match(rotatedQuestion, /\.mask-layer\{container-type:size\}/);
  assert.match((await render(overlay, "question", "io:1")).srcdoc, /<img class="mask-overlay" src="q\.svg" alt=""\/><\/div>/);
  assert.match((await render(overlay, "answer", "io:1")).srcdoc, /<img class="mask-overlay" src="a\.svg" alt=""\/><\/div>/);
  assert.match((await render(overlay, "question", "io:1")).srcdoc, /<img src="bild\.png" alt="Frage – Bild mit verdeckten Bereichen"\/>/);
});

test("Marker folgen dem Theme; graue Fremdhintergründe entfallen und Text bleibt auf seinem Marker lesbar", async () => {
  const dark: NotePresentationTheme = { mode: "dark", colors: { ...theme.colors, surface: "#17151f", text: "#f4f0ff" } };
  const value = basic();
  value.fields[0].html = '<span style="background-color: yellow">Marker</span> <span style="background-color: rgb(32, 33, 36); color: rgb(255 255 255/var(--tw-text-opacity))">Kopie</span>';
  const graph = createNote({ content: value, deckId: "deck" });
  const styles = async (colors: NotePresentationTheme) => [...(await renderCard({ ...graph, card: graph.cards[0], side: "question", surface: "review", theme: colors })).srcdoc.matchAll(/<span style="([^"]*)">/g)].map((match) => match[1]);
  const [lightMarker, lightCopy] = await styles(theme);
  const [darkMarker] = await styles(dark);
  const background = (style: string) => /background-color:(#[\da-f]{6})/.exec(style)![1];
  assert.ok(colorContrast(background(lightMarker), theme.colors.text) >= 4.5);
  assert.ok(colorContrast(background(darkMarker), dark.colors.text) >= 4.5);
  assert.notEqual(background(darkMarker), background(lightMarker));
  assert.doesNotMatch(lightCopy, /background|color/);
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

// --- Originallayout importierter Karten (ADR-047) ---

const POKEMON_FIELDS: Array<[string, NoteField["role"]]> = [["Name", "answer"], ["Nummer", "prompt"], ["Generation", "prompt"], ["Bild", "prompt"], ["Hinweis", "hint"]];
const POKEMON_NAMES = POKEMON_FIELDS.map(([name]) => name);
const POKEMON_FRONT = '<div class="meta"><span class="dex" data-generation="{{Generation}}">{{Nummer}}</span> · Generation {{Generation}}</div><div class="art">{{Bild}}</div>';
const POKEMON_CSS = ".card{font-family:Georgia}.meta{color:#555}";
const pokemon = ["Karpador", "???", "X", '<img src="pk0129.png">', ""];

function layoutSource(names: string[], front: string, back: string, options: { css?: string; kind?: number } = {}): NoteTypeSource {
  return {
    id: "vorlage", ankiNotetypeId: "1", name: "Pokémon", translator: { id: "generic", version: 3 }, kind: options.kind ?? 0, originalStockKind: 0,
    css: options.css ?? POKEMON_CSS, fields: names.map((name, ordinal) => ({ name, ordinal })),
    templates: [{ name: "Bilderkennung", ordinal: 0, front, back, targetDeckId: null }], config: {},
  };
}

async function renderLayout(source: NoteTypeSource | null, values: string[], side: "question" | "answer", options: {
  fields?: Array<[string, NoteField["role"]]>; interaction?: NoteContent["interaction"]; promptKey?: string; translator?: string; tags?: string[];
  typedAnswer?: string; mode?: NotePresentationTheme["mode"]; deckName?: string;
} = {}) {
  const fields = (options.fields ?? POKEMON_FIELDS).map(([name, role], ordinal): NoteField => ({ id: `f${ordinal}`, name, role, html: values[ordinal] ?? "" }));
  const value = content(options.interaction ?? { kind: "reveal", prompts: [{ key: "anki-0", name: "Bilderkennung", instruction: "", questionFieldIds: ["f1", "f2", "f3"], answerFieldIds: ["f0"], requires: null, typeInFieldId: null }] }, fields);
  value.tags = options.tags ?? [];
  const graph = createNote({ content: value, deckId: "deck" });
  const note = { ...graph.note, noteTypeSourceId: "vorlage", translator: { id: options.translator ?? "generic", version: 3 } };
  const card = graph.cards.find((item) => item.promptKey === (options.promptKey ?? "anki-0"))!;
  return renderCard({ note, card, side, surface: "review", theme: { ...theme, mode: options.mode ?? "light" }, typedAnswer: options.typedAnswer, noteTypeSource: source, deckName: options.deckName });
}

test("Originallayout setzt Zeilen aus mehreren Feldern wie das Template zusammen", async () => {
  const source = layoutSource(POKEMON_NAMES, POKEMON_FRONT, '{{FrontSide}}<hr id=answer><div class="name">{{Name}}</div>');
  const question = await renderLayout(source, pokemon, "question");
  assert.equal(question.layout, "original");
  assert.match(question.srcdoc, /<span class="dex" data-generation="X">\?\?\?<\/span> · Generation X/);
  assert.match(question.srcdoc, /<body class="card card1">/);
  assert.match(question.srcdoc, /\.meta\{color:#555\}/);
  assert.equal(question.accessibleText, "??? · Generation X");
  assert.deepEqual(question.mediaReferences, ["pk0129.png"]);
  const answer = await renderLayout(source, pokemon, "answer");
  assert.match(answer.srcdoc, /<hr id="answer" \/><div class="name">Karpador<\/div>/);
  assert.equal(answer.accessibleText, "??? · Generation X Karpador");
});

test("Originallayout setzt Felder in Attributen als Text ein und entfernt Nachladen und Schadcode aus Template und CSS", async () => {
  const front = '<div class="x" title="{{Nummer}}">{{Generation}}</div><iframe src="https://evil.example/f"></iframe><object data="x"></object><form action="https://evil.example"><input></form><img src="https://evil.example/p.png">';
  const css = '.x{color:red}@import url("https://evil.example/a.css");.y{background:url(https://evil.example/p.png)}.z{background:url("lokal.png")}</style><img src=x>';
  const result = await renderLayout(layoutSource(POKEMON_NAMES, front, front, { css }), ["", 'a"><b>b</b>', "X"], "question");
  assert.equal(result.layout, "original");
  assert.match(result.srcdoc, /title="a&quot;&gt;b"/);
  assert.doesNotMatch(result.srcdoc, /evil\.example|<iframe|<object|<form|<input/);
  assert.doesNotMatch(result.srcdoc, /<\/style><img/);
  assert.deepEqual(result.mediaReferences, ["lokal.png"]);
});

test("Ohne eigenes Design, mit Script oder Button und außerhalb des generischen Übersetzers bleibt das CoRe-Design", async () => {
  const layouts = await Promise.all([
    renderLayout(layoutSource(POKEMON_NAMES, POKEMON_FRONT, POKEMON_FRONT, { css: ".card { font-family: arial; color: black }\n.nightMode .card { color: white }" }), pokemon, "question"),
    renderLayout(layoutSource(POKEMON_NAMES, `${POKEMON_FRONT}<script>fill()</script>`, POKEMON_FRONT), pokemon, "question"),
    renderLayout(layoutSource(POKEMON_NAMES, `${POKEMON_FRONT}<button onclick="show()">Mehr</button>`, POKEMON_FRONT), pokemon, "question"),
    renderLayout(layoutSource(POKEMON_NAMES, POKEMON_FRONT, POKEMON_FRONT), pokemon, "question", { translator: "anki-basic" }),
    renderLayout(null, pokemon, "question"),
  ]);
  assert.deepEqual(layouts.map((result) => result.layout), ["core", "core", "core", "core", "core"]);
});

test("Eine leere Vorderseite fällt mit Hinweis auf das CoRe-Design zurück", async () => {
  const result = await renderLayout(layoutSource(POKEMON_NAMES, '<div class="ziel">{{#Hinweis}}{{Hinweis}}{{/Hinweis}}</div>', ""), pokemon, "question");
  assert.equal(result.layout, "core");
  assert.deepEqual(result.diagnostics.map((item) => item.message), ["Originallayout nicht darstellbar."]);
  assert.match(result.accessibleText, /\?\?\? X/);
});

test("Originallayout folgt Ankis Bedingungen, Filtern und Sonderfeldern", async () => {
  const front = '{{#Generation}}<p class="g">{{text:Generation}}</p>{{/Generation}}{{^Nummer}}<p>ohne Nummer</p>{{/Nummer}}{{#Nummer}}<p>mit Nummer</p>{{/Nummer}}'
    + '{{hint:Hinweis}}<div class="s">{{Tags}}|{{Card}}|{{Type}}|{{Deck}}|{{Subdeck}}</div>{{type:Name}}{{tts de_DE:Name}}';
  const source = layoutSource(POKEMON_NAMES, front, "{{FrontSide}}<hr id=answer>{{type:Name}}");
  const typeIn: NoteContent["interaction"] = { kind: "reveal", prompts: [{ key: "anki-0", name: "Bilderkennung", instruction: "", questionFieldIds: ["f2"], answerFieldIds: ["f0"], requires: null, typeInFieldId: "f0" }] };
  const values = ["Karpador", "", "<b>X</b>", "", "Wasser"];
  const question = await renderLayout(source, values, "question", { interaction: typeIn, tags: ["pokemon"], deckName: "Pokémon::Gen I" });
  assert.match(question.srcdoc, /<p class="g">X<\/p><p>ohne Nummer<\/p><details><summary>Hinweis<\/summary>Wasser<\/details>/);
  assert.match(question.srcdoc, /<div class="s">pokemon\|Bilderkennung\|Pokémon\|Pokémon::Gen I\|Gen I<\/div>/);
  assert.doesNotMatch(question.accessibleText, /Karpador|mit Nummer/);
  assert.deepEqual([...question.interactions].sort(), ["hint", "typed-answer"]);
  const answer = await renderLayout(source, values, "answer", { interaction: typeIn, typedAnswer: "Karpadr" });
  assert.match(answer.srcdoc, /<div class="core-typed-comparison" data-correct="false">/);
  assert.match(answer.srcdoc, /\.core-typed-comparison\{/);
});

test("Lücken im Originallayout tragen Ankis Klasse cloze", async () => {
  const fields: Array<[string, NoteField["role"]]> = [["Text", "prompt"], ["Extra", "extra"]];
  const source = layoutSource(["Text", "Extra"], '<div class="c">{{cloze:Text}}</div>', '<div class="c">{{cloze:Text}}</div><div class="e">{{Extra}}</div>', { kind: 1 });
  const values = ["{{c1::Paris}} liegt an der {{c2::Seine}}.", "Hauptstadt"];
  const question = await renderLayout(source, values, "question", { fields, interaction: { kind: "cloze" }, promptKey: "cloze:1" });
  assert.match(question.srcdoc, /<div class="c"><span class="cloze">\[…\]<\/span> liegt an der Seine\.<\/div>/);
  assert.match(question.srcdoc, /<body class="card card1">/);
  const answer = await renderLayout(source, values, "answer", { fields, interaction: { kind: "cloze" }, promptKey: "cloze:2" });
  assert.match(answer.srcdoc, /Paris liegt an der <span class="cloze">Seine<\/span>\./);
  assert.match(answer.srcdoc, /<body class="card card2">/);
});

test("Im Dark Mode trägt das Originallayout Ankis Nachtklassen und ohne eigene Nachtregeln Ankis dunkle Kartenfarben", async () => {
  const plain = await renderLayout(layoutSource(POKEMON_NAMES, POKEMON_FRONT, POKEMON_FRONT), pokemon, "question", { mode: "dark" });
  assert.match(plain.srcdoc, /<html class="nightMode night_mode">/);
  assert.match(plain.srcdoc, /<body class="card card1 nightMode night_mode">/);
  assert.match(plain.srcdoc, /\.card\{background-color:#2c2c2c;color:#fcfcfc\}/);
  const own = await renderLayout(layoutSource(POKEMON_NAMES, POKEMON_FRONT, POKEMON_FRONT, { css: `${POKEMON_CSS}.nightMode .card{color:#eee}` }), pokemon, "question", { mode: "dark" });
  assert.doesNotMatch(own.srcdoc, /#2c2c2c/);
});
