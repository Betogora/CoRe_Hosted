import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ANKI_PACKAGE_MAX_BYTES, readAnkiPackage, type AnkiPackage, type AnkiPackageMediaFile } from "./apkgImportInternal.ts";
import { parseImageOcclusionField, translateAnkiPackage } from "./apkgNoteTranslation.ts";

const IMPORTED_AT = "2026-10-07T12:00:00.000Z";
const CREATED_SECONDS = Date.parse("2026-01-01T00:00:00.000Z") / 1000;

function model(id: string, fields: string[], templates: Array<[string, string]>, options: { kind?: number; stock?: number; name?: string } = {}) {
  return {
    id,
    name: options.name ?? `Notiztyp ${id}`,
    type: options.kind ?? 0,
    config: { kind: options.kind ?? 0, originalStockKind: options.stock ?? 0, css: "" },
    flds: fields.map((name, ord) => ({ name, ord })),
    tmpls: templates.map(([qfmt, afmt], ord) => ({ name: `Karte ${ord + 1}`, ord, qfmt, afmt })),
  };
}

function media(name: string, sha1: string): AnkiPackageMediaFile {
  return { name, sha1, size: 1, mimeType: "image/png", readBytes: async () => new Uint8Array([1]) };
}

function ankiPackage(input: Partial<AnkiPackage> & Pick<AnkiPackage, "models" | "notes" | "cards">): AnkiPackage {
  return {
    file: { name: "test.apkg", size: 1 },
    packageFormat: "latest",
    collectionCreatedAt: CREATED_SECONDS,
    decks: [{ id: "10", name: "Stapel", filtered: false }],
    reviewHistory: { entries: [], totalRows: 0, skippedRows: 0 },
    media: { format: "media-entries", files: [], missing: [] },
    ...input,
  };
}

const basic = model("1", ["Front", "Back"], [["{{Front}}", "{{FrontSide}}<hr id=answer>{{Back}}"]], { stock: 1 });
const note = (id: string, mid: string, fields: string[], tags = "") => ({ id, guid: `guid-${id}`, mid, flds: fields.join("\u001f"), tags });
const card = (id: string, nid: string, ord = 0, state: Record<string, unknown> = {}) => ({ id, nid, did: "10", ord, type: 0, queue: 0, due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0, odid: 0, odue: 0, flags: 0, data: "", ...state });

test("Medien werden normalisiert, je SHA-1 einmal übernommen und nur aus src, poster und [sound:] gelesen", () => {
  const graph = translateAnkiPackage(ankiPackage({
    models: { 1: basic },
    notes: [note("100", "1", ['<img src="kopie.png"> <img src="Ärzte.png"> <a href="link.png">Link</a>', "[sound:fehlt.mp3]"])],
    cards: [card("200", "100")],
    media: { format: "media-entries", missing: [], files: [media("bild.png", "aaa"), media("kopie.png", "aaa"), media("Ärzte.png", "bbb"), media("schrift.woff", "ccc")] },
  }), { importedAt: IMPORTED_AT });

  const front = graph.notes[0].content.fields[0].html;
  assert.match(front, /src="bild\.png"/);
  assert.match(front, /src="Ärzte\.png"/);
  assert.deepEqual(graph.mediaFiles.map((file) => file.name).sort(), ["bild.png", "Ärzte.png"]);
  assert.deepEqual(graph.report.missingMedia, ["fehlt.mp3"]);
});

test("Ungültige Übersetzungen fallen auf eine Feldliste zurück, ohne die Anki-Karte zu verlieren", () => {
  const choice = model("2", ["Question", "QType (0=kprim,1=mc,2=sc)", "Q_1", "Q_2", "Q_3", "Answers"], [[
    '{{Question}}<table id="qtable"></table><div id="Q_solutions">{{Answers}}</div>', "{{Question}}",
  ]], { stock: 1 });
  const graph = translateAnkiPackage(ankiPackage({
    models: { 2: choice },
    notes: [note("100", "2", ["Welche?", "1", "A", "B", "C", "1 0"])],
    cards: [card("200", "100")],
  }), { importedAt: IMPORTED_AT });

  assert.deepEqual(graph.notes[0].translator, { id: "field-list", version: 1 });
  assert.equal(graph.notes[0].content.interaction.kind, "reveal");
  assert.deepEqual(graph.cards.map((item) => [item.promptKey, item.ankiCardId]), [["anki-0", "200"]]);
  assert.equal(graph.report.notetypes[0].translator.id, "multiple-choice-for-anki");
  assert.equal(graph.report.notetypes[0].fallbackNotes, 1);
});

test("Geänderte Basic-Vorlagen und Zusatzfelder werden generisch übersetzt; nur unveränderte Vorlagen gelten als Basic", () => {
  const changed = model("3", ["Front", "Back"], [["Frage: {{Front}}", "{{FrontSide}}<hr id=answer>{{Back}}"]], { stock: 1 });
  const anking = model("4", ["Text", "Extra", "Personal Notes", "One by one", "Amboss-Link"], [[
    '{{cloze:Text}}{{#Personal Notes}}<a class="hint" onclick="toggle()">Notizen</a><div>{{Personal Notes}}</div>{{/Personal Notes}}',
    "{{cloze:Text}}<hr>{{Extra}}{{Amboss-Link}}",
  ]], { kind: 1, stock: 5 });
  const graph = translateAnkiPackage(ankiPackage({
    models: { 1: basic, 3: changed, 4: anking },
    notes: [note("100", "1", ["F", "A"]), note("101", "3", ["F", "A"]), note("102", "4", ["{{c1::Troponin}}", "", "Eigene Notiz", "y", ""])],
    cards: [card("200", "100"), card("201", "101"), card("202", "102")],
  }), { importedAt: IMPORTED_AT });

  assert.deepEqual(graph.cards.map((item) => item.promptKey), ["forward", "anki-0", "cloze:1"]);
  assert.deepEqual(graph.report.notetypes.map((report) => report.translator.id), ["anki-basic", "generic", "anking"]);
  assert.deepEqual(graph.report.notetypes[2].fieldRoles, { Text: "prompt", Extra: "extra", "Personal Notes": "hint", "One by one": "note", "Amboss-Link": "source" });
  assert.deepEqual(graph.report.notetypes[2].unmappedFields, ["One by one"]);
  const instruction = graph.notes[1].content.interaction;
  assert.equal(instruction.kind === "reveal" && instruction.prompts[0].instruction, "Frage: …");
  assert.equal(graph.notes[0].importedContentRevision, graph.notes[0].contentRevision);
});

test("Ankizin-artige Vorlagen: Kopfzeilen-Metadaten, Rückseiten-Buttons, Link-Ziele und Anweisung aus der Fragezeile", () => {
  const header = '<div class="header"><strong>{{Source}}</strong> | {{#Note ID}}<button onclick="f()">ID</button>{{/Note ID}}<div style="display:none">{{Note ID}}</div>'
    + '<a href="https://forms.example/errata?entry={{Note ID}}"><button>Errata</button></a></div><hr>';
  const back = '{{#Klinik}}<button onclick="f()">Klinik</button><div>{{Klinik}}</div>{{/Klinik}}{{#AMBOSS-Link}}<a href="{{AMBOSS-Link}}">AMBOSS</a>{{/AMBOSS-Link}}';
  const muscles = model("6", ["Titel", "Muskel", "Ursprung", "Klinik", "AMBOSS-Link", "Source", "Note ID"], [[
    `${header}<div class="titel">{{edit:Titel}}</div><p></p> Wo liegt der <i>Ursprung</i> des <div class="muskel">{{edit:Muskel}}</div>?<p></p>`,
    `${header}<div>{{Titel}}</div><p></p>{{edit:Ursprung}}${back}`,
  ]]);
  const graph = translateAnkiPackage(ankiPackage({
    models: { 6: muscles },
    notes: [note("100", "6", ["Rotatorenmanschette", "M. supraspinatus", "Fossa supraspinata", "Impingement", "https://next.amboss.com/de/article/x", "AMBOSS", "1565424901299"])],
    cards: [card("200", "100")],
  }), { importedAt: IMPORTED_AT });

  assert.deepEqual(graph.report.notetypes[0].fieldRoles, { Titel: "prompt", Muskel: "prompt", Ursprung: "answer", Klinik: "extra", "AMBOSS-Link": "source", Source: "source", "Note ID": "note" });
  const content = graph.notes[0].content;
  assert.equal(content.interaction.kind === "reveal" && content.interaction.prompts[0].instruction, "Wo liegt der Ursprung des …?");
  assert.match(content.fields.find((field) => field.name === "AMBOSS-Link")?.html ?? "", /^<a [^>]*href="https:\/\/next\.amboss\.com\/de\/article\/x">AMBOSS-Link<\/a>$/);
  assert.equal(content.fields.find((field) => field.name === "Note ID")?.html, "1565424901299");
});

test("Native Bildverdeckung liest Radien, maskierte Doppelpunkte, Drehung und dauerhaft verdeckte Formen", () => {
  const masks = parseImageOcclusionField(
    "{{c1::image-occlusion:ellipse:left=.2:top=.3:rx=.1:ry=.05:angle=15:oi=1}}"
    + "{{c2::image-occlusion:text:text=A\\:B:left=.5:top=.6:scale=1.5}}"
    + "{{c2::image-occlusion:polygon:points=.1,.1 .2,.1 .15,.2}}",
  );
  assert.deepEqual(masks.map((mask) => [mask.ordinal, mask.alwaysOccluded, mask.shape]), [
    [1, true, { kind: "ellipse", left: 0.2, top: 0.3, width: 0.2, height: 0.1, angle: 15 }],
    [2, false, { kind: "text", left: 0.5, top: 0.6, text: "A:B", scale: 1.5, angle: 0 }],
    [2, false, { kind: "polygon", points: [[0.1, 0.1], [0.2, 0.1], [0.15, 0.2]], angle: 0 }],
  ]);
});

test("Lernstand: klassischer Zustand ohne FSRS und Revlog, Fälligkeit aus dem Sammlungsdatum, zurückgesetzte Karten neu", () => {
  const entry = { reviewId: "1767225600000", cardId: "201", rating: "good" as const, answeredAt: "2026-01-01T00:00:00.000Z", responseTimeMs: 4000, reviewType: 1, beforeState: "review" as const, afterState: "review" as const, beforeIntervalDays: 1, beforeIntervalMinutes: null, afterIntervalDays: 3, afterIntervalMinutes: null, ease: 2.5 };
  const graph = translateAnkiPackage(ankiPackage({
    models: { 1: basic },
    notes: [note("100", "1", ["Klassisch", "A"], " marked Leech "), note("101", "1", ["Zurückgesetzt", "A"])],
    cards: [card("200", "100", 0, { type: 2, queue: 2, due: 100, ivl: 10, factor: 2500, reps: 3, lapses: 1, flags: 9 }), card("201", "101")],
    reviewHistory: { entries: [entry], totalRows: 1, skippedRows: 0 },
  }), { importedAt: IMPORTED_AT });

  const [classic, reset] = graph.cards;
  assert.equal(classic.study.state, "review");
  assert.equal(classic.study.dueAt, new Date((CREATED_SECONDS + 100 * 86_400) * 1000).toISOString());
  assert.deepEqual([classic.study.stability, classic.study.difficulty, classic.study.reps, classic.study.lapses], [10, 6, 3, 1]);
  assert.equal(classic.ankiFlag, 1);
  assert.equal(graph.notes[0].marked, true);
  assert.deepEqual(graph.notes[0].content.tags, ["Leech"]);
  assert.equal(reset.study.state, "new");
  assert.deepEqual(graph.reviewEvents.map((event) => event.cardId), [reset.id]);
  assert.deepEqual(graph.report.notetypes[0].study, { "fsrs-memory-state": 0, "revlog-replay": 0, "classic-state": 1, new: 1 });
});

test("Fehlende Karten werden aus dem Inhalt abgeleitet, überzählige Anki-Karten berichtet", () => {
  const cloze = model("5", ["Text", "Back Extra"], [["{{cloze:Text}}", "{{cloze:Text}}<br>{{Back Extra}}"]], { kind: 1, stock: 5 });
  const graph = translateAnkiPackage(ankiPackage({
    models: { 5: cloze },
    notes: [note("100", "5", ["{{c1::A}} und {{c2::B}}", ""])],
    cards: [card("200", "100", 0), card("204", "100", 4)],
  }), { importedAt: IMPORTED_AT });

  assert.deepEqual(graph.cards.map((item) => [item.promptKey, item.ankiCardId]), [["cloze:1", "200"], ["cloze:2", null]]);
  assert.deepEqual([graph.report.addedCards, graph.report.droppedCards], [1, 1]);
  assert.equal(graph.report.notetypes[0].translator.id, "anki-cloze");
});

test("Moderne Pakete ordnen Medien per Position ihrem ZIP-Eintrag zu", async () => {
  const name = "special-latest.apkg";
  const pkg = await readAnkiPackage(new File([await readFile(new URL(`../fixtures/apkg/matrix/${name}`, import.meta.url))], name));
  assert.equal(pkg.media.format, "media-entries");
  for (const file of pkg.media.files) {
    assert.equal(createHash("sha1").update(await file.readBytes()).digest("hex"), file.sha1, file.name);
  }
});

test("Nur .apkg und .colpkg bis 2 GiB werden gelesen", async () => {
  await assert.rejects(readAnkiPackage(new File([], "stapel.zip")), /\.apkg oder \.colpkg/);
  await assert.rejects(readAnkiPackage({ name: "gross.colpkg", size: ANKI_PACKAGE_MAX_BYTES + 1 } as Blob & { name: string }), /größer als 2 GiB/);
});
