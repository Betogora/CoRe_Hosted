import assert from "node:assert/strict";
import test from "node:test";
import { describeAiSourceCardsRun, readAiSource, runAiSourceCards, sourcePortions, splitAiSource, type AiSourceCardsRequester, type SourceUnit } from "./aiSourceCards.ts";
import { AiSourceCardsError, type GeneratedSourceCard } from "./aiSourceCardsContract.ts";
import { createAiSourceCreationDraft } from "./aiSourceCreation.ts";

const { wishes: _wishes, ...defaults } = createAiSourceCreationDraft().settings;
const settings = { ...defaults, wishes: "" };
const text = (value: string, fileName = "notizen.md") => ({ fileName, text: value, textExtractionStatus: "success" as const, metadata: {} });
const labels = (value: ReturnType<typeof splitAiSource>) => value.units.map((unit) => unit.label);

test("PDF-Seiten werden einzeln belegt, Seiten ohne Textlayer werden genannt, lange Seiten geteilt", () => {
  const long = Array.from({ length: 700 }, (_, index) => `Wort${index}`).join(" ");
  const pdf = splitAiSource({ fileName: "skript.pdf", text: "…", textExtractionStatus: "success", metadata: { pages: [
    { pageNumber: 1, text: "Seite 1\nATP ist ein Energieträger.", textItemCount: 4 },
    { pageNumber: 2, text: "Seite 2\nKein Textlayer gefunden.", textItemCount: 0 },
    { pageNumber: 3, text: long, textItemCount: 700 },
  ] } });
  assert.deepEqual(labels(pdf), ["Seite 1", "Seite 3, Teil 1", "Seite 3, Teil 2"]);
  assert.deepEqual(pdf.units.map((unit) => unit.id), ["s1", "s2", "s3"]);
  assert.ok(pdf.units.every((unit) => unit.text.length <= 4_000));
  assert.equal(pdf.units.slice(1).map((unit) => unit.text).join(" "), long);
  assert.deepEqual(pdf.notices, ["Seite 2 ohne Textlayer wurde nicht ausgewertet."]);
  assert.throws(() => splitAiSource({ fileName: "scan.pdf", text: "", textExtractionStatus: "empty", metadata: { pages: [{ pageNumber: 1, text: "Seite 1\nKein Textlayer gefunden.", textItemCount: 0 }] } }), /keinen lesbaren Text/);
});

test("Text und Markdown werden nach Überschriften und Absätzen mit echten Zeilen belegt", () => {
  const markdown = splitAiSource(text("Einleitung ohne Überschrift.\n\n# Zellatmung\nGlykolyse im Cytosol.\n\nDanach Citratzyklus.\n\n\n## Atmungskette\nInnere Membran.\n"));
  assert.deepEqual(labels(markdown), ["Zeile 1", "Zellatmung · Zeilen 3–6", "Atmungskette · Zeilen 9–10"]);
  assert.equal(markdown.units[1].text, "# Zellatmung\nGlykolyse im Cytosol.\n\nDanach Citratzyklus.");
  const paragraphs = Array.from({ length: 12 }, (_, index) => `Absatz ${index + 1}: ${"x".repeat(390)}`).join("\n\n");
  const split = splitAiSource(text(paragraphs, "lang.txt"));
  assert.ok(split.units.length > 1 && split.units.every((unit) => unit.text.length <= 4_000));
  assert.equal(split.units[0].label, "Zeilen 1–15");
  assert.match(split.units[1].text, /^Absatz 9:/);
});

test("CSV und TSV wiederholen die Kopfzeile je Block und nennen die Zeilen", () => {
  const rows = Array.from({ length: 60 }, (_, index) => `Begriff ${index + 1}\t${"Erklärung ".repeat(10)}`);
  const table = splitAiSource(text(["Begriff\tErklärung", ...rows, ""].join("\n"), "glossar.TSV"));
  assert.ok(table.units.length > 1);
  assert.ok(table.units.every((unit) => unit.text.startsWith("Begriff\tErklärung\n")));
  assert.equal(table.units[0].label.split("–")[0], "Zeilen 2");
  assert.equal(table.units.at(-1)!.label.split("–")[1], "61");
});

test("Leere, unlesbare oder zu große Quellen werden mit Meldung abgewiesen", async () => {
  assert.throws(() => splitAiSource(text(" \n\n ")), /keinen lesbaren Text/);
  assert.throws(() => splitAiSource({ ...text(""), textExtractionStatus: "error" }), /Geschützte oder beschädigte/);
  assert.throws(() => splitAiSource(text("x".repeat(400_001))), /höchstens 400\.000 Zeichen/);
  const big = new File(["x"], "gross.pdf");
  Object.defineProperty(big, "size", { value: 20 * 1_024 * 1_024 + 1 });
  await assert.rejects(readAiSource({ sourceMode: "file", sourceText: "", file: big }), /bis 20 MiB/);
  const read = await readAiSource({ sourceMode: "file", sourceText: "", file: new File(["Begriff,Erklärung\nATP,Energieträger"], "liste.csv") });
  assert.deepEqual(read.units, [{ id: "s1", label: "Zeile 2", text: "Begriff,Erklärung\nATP,Energieträger" }]);
  assert.deepEqual((await readAiSource({ sourceMode: "text", sourceText: "Eingefügt.", file: null })).units, [{ id: "s1", label: "Zeile 1", text: "Eingefügt." }]);
});

const unit = (index: number, size = 4_000): SourceUnit => ({ id: `s${index}`, label: `Seite ${index}`, text: "x".repeat(size) });

test("Abschnitte passen in eine Anfrage: höchstens 15.000 Zeichen und 200 Einheiten", () => {
  assert.deepEqual(sourcePortions([1, 2, 3, 4, 5].map((index) => unit(index))).map((portion) => portion.map(({ id }) => id)), [["s1", "s2", "s3"], ["s4", "s5"]]);
  assert.deepEqual(sourcePortions(Array.from({ length: 201 }, (_, index) => unit(index + 1, 10))).map((portion) => portion.length), [200, 1]);
});

const card = (front: string, sources = ["s1"]): GeneratedSourceCard => ({ form: "basic", front, back: "Antwort", options: [], explanation: "", sources });

test("Der Lauf sendet Abschnitte nacheinander mit bisherigen Fragen und Restlimit und belegt Vorschläge mit ihren Stellen", async () => {
  const requests: Array<{ ids: string[]; avoid: string[]; limit: number }> = [];
  const progress: string[] = [];
  const request: AiSourceCardsRequester = async (body) => {
    requests.push({ ids: body.units.map((item) => item.id), avoid: body.avoid, limit: body.limit });
    const first = body.units[0].id;
    return { cards: [card(`Frage zu ${first}?`, [first])], warnings: ["Seite 2 ist knapp.", ...(first === "s4" ? ["Neu"] : [])], discarded: 1 };
  };
  const result = await runAiSourceCards({ units: [1, 2, 3, 4, 5].map((index) => unit(index)), settings, request, signal: new AbortController().signal, onProgress: ({ done, total }) => progress.push(`${done}/${total}`) });
  assert.deepEqual(requests, [
    { ids: ["s1", "s2", "s3"], avoid: [], limit: 100 },
    { ids: ["s4", "s5"], avoid: ["Frage zu s1?"], limit: 99 },
  ]);
  assert.deepEqual(progress, ["0/2", "1/2", "2/2"]);
  assert.deepEqual(result.proposals.map(({ id, sourceLabels }) => ({ id, sourceLabels })), [{ id: "p1", sourceLabels: ["Seite 1"] }, { id: "p2", sourceLabels: ["Seite 4"] }]);
  assert.deepEqual(result.warnings, ["Seite 2 ist knapp.", "Neu"]);
  assert.equal(result.discarded, 2);
  assert.equal(result.stopped, null);
  assert.deepEqual(describeAiSourceCardsRun(result), ["2 ungültige oder doppelte Vorschläge wurden verworfen."]);
});

test("Bei 100 Vorschlägen endet der Lauf und nennt die erste nicht ausgewertete Stelle", async () => {
  const request: AiSourceCardsRequester = async (body) => ({ cards: Array.from({ length: Math.min(body.limit, 25) }, (_, index) => card(`${body.units[0].id} ${index}?`)), warnings: [], discarded: 0 });
  const result = await runAiSourceCards({ units: Array.from({ length: 18 }, (_, index) => unit(index + 1)), settings, request, signal: new AbortController().signal });
  assert.equal(result.proposals.length, 100);
  assert.deepEqual(result.stopped, { reason: "limit", from: "Seite 13" });
  assert.deepEqual(describeAiSourceCardsRun(result), ["Die Obergrenze von 100 Vorschlägen ist erreicht. Ab Seite 13 wurde die Quelle nicht ausgewertet."]);
});

test("Abbruch behält Erhaltenes, Fehler einzelner Abschnitte werden genannt, Fehler für alle stoppen den Lauf", async () => {
  const controller = new AbortController();
  const cancelled = await runAiSourceCards({ units: [1, 2, 3, 4].map((index) => unit(index)), settings, signal: controller.signal, request: async (body) => {
    controller.abort();
    return { cards: [card(`Frage ${body.units[0].id}?`)], warnings: [], discarded: 0 };
  } });
  assert.equal(cancelled.proposals.length, 1);
  assert.deepEqual(cancelled.stopped, { reason: "cancelled", from: "Seite 4" });

  let calls = 0;
  const units = Array.from({ length: 9 }, (_, index) => unit(index + 1));
  const failing = await runAiSourceCards({ units, settings, signal: new AbortController().signal, request: async (body) => {
    calls += 1;
    if (calls === 1) throw new AiSourceCardsError("invalid_response", "Die KI hat keine gültigen Kartenvorschläge geliefert.");
    if (calls === 2) return { cards: [card(`Frage ${body.units[0].id}?`)], warnings: [], discarded: 0 };
    throw new AiSourceCardsError("rate_limited", "Gerade wurden zu viele Karten angefordert.");
  } });
  assert.equal(calls, 3);
  assert.equal(failing.proposals.length, 1);
  assert.deepEqual(failing.failed, [{ range: "Seite 1 bis Seite 3", message: "Die KI hat keine gültigen Kartenvorschläge geliefert." }]);
  assert.deepEqual(failing.stopped, { reason: "error", message: "Gerade wurden zu viele Karten angefordert.", from: "Seite 7" });
  assert.deepEqual(describeAiSourceCardsRun(failing), [
    "Gestoppt: Gerade wurden zu viele Karten angefordert. Ab Seite 7 wurde die Quelle nicht ausgewertet.",
    "Seite 1 bis Seite 3 konnte nicht ausgewertet werden: Die KI hat keine gültigen Kartenvorschläge geliefert.",
  ]);
  const empty = await runAiSourceCards({ units: [unit(1)], settings, signal: new AbortController().signal, request: async () => ({ cards: [], warnings: [], discarded: 0 }) });
  assert.deepEqual(describeAiSourceCardsRun(empty), ["Die Quelle ergab keine Kartenvorschläge."]);
});
