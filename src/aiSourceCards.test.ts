import assert from "node:assert/strict";
import test from "node:test";
import { adoptionDeckId, describeAiSourceCardsRun, proposalNoteContent, readAiSource, requestAiSourceCards, runAiSourceCards, saveProposals, splitAiSource, type AiSourceCardsRequester, type SourceUnit } from "./aiSourceCards.ts";
import { createNote } from "./coreModel.ts";
import { AiSourceCardsError, parseAiSourceCardsRequest, type GeneratedSourceCard } from "./aiSourceCardsContract.ts";
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

test("Lange Überschriften kürzen nur sich selbst, Code-Kommentare sind keine Überschriften, reine Überschriften tragen nichts", () => {
  const heading = `Kapitel ${"sehr ".repeat(30)}lang`;
  const long = splitAiSource(text(`# ${heading}\n${"a ".repeat(2_500)}`));
  assert.deepEqual(labels(long).map((label) => label.replace(/^.*… · /, "")), ["Zeile 2, Teil 1", "Zeile 2, Teil 2"]);
  assert.ok(labels(long).every((label) => label.length < 120));
  const code = splitAiSource(text("# Installation\nSo geht es:\n```bash\n# Pakete installieren\nnpm ci\n```\nFertig."));
  assert.deepEqual(labels(code), ["Installation · Zeilen 1–7"]);
  assert.throws(() => splitAiSource(text("# Titel\n\n## Untertitel\n")), /keinen lesbaren Text/);
});

test("CSV und TSV wiederholen die Kopfzeile je Block und Teil und nennen die Zeilen", () => {
  const rows = Array.from({ length: 60 }, (_, index) => `Begriff ${index + 1}\t${"Erklärung ".repeat(10)}`);
  const table = splitAiSource(text(["Begriff\tErklärung", ...rows, ""].join("\n"), "glossar.TSV"));
  assert.ok(table.units.length > 1);
  assert.ok(table.units.every((unit) => unit.text.startsWith("Begriff\tErklärung\n")));
  assert.equal(table.units[0].label.split("–")[0], "Zeilen 2");
  assert.equal(table.units.at(-1)!.label.split("–")[1], "61");
  const wide = splitAiSource(text(`Begriff,Erklärung\nATP,${"Energie ".repeat(700)}`, "liste.csv"));
  assert.deepEqual(labels(wide), ["Zeile 2, Teil 1", "Zeile 2, Teil 2"]);
  assert.ok(wide.units.every((unit) => unit.text.startsWith("Begriff,Erklärung\n") && unit.text.length <= 4_000));
  assert.throws(() => splitAiSource(text("Begriff,Erklärung\n", "leer.csv")), /keinen lesbaren Text/);
  // A survey export with long questions as column heads: the header stands alone instead of shrinking every part.
  const longHeader = Array.from({ length: 40 }, (_, index) => `Wie bewerten Sie Aussage ${index + 1} zur Lehrveranstaltung?`).join(",");
  const survey = splitAiSource(text(`${longHeader}\n${Array.from({ length: 40 }, () => "gut").join(",")}`, "umfrage.csv"));
  assert.deepEqual(labels(survey), ["Zeile 1", "Zeile 2"]);
  assert.ok(survey.units.every((unit) => unit.text.length <= 4_000));
});

test("Leere, unlesbare oder zu große Quellen werden mit Meldung abgewiesen", async () => {
  assert.throws(() => splitAiSource(text(" \n\n ")), /keinen lesbaren Text/);
  assert.throws(() => splitAiSource({ ...text(""), textExtractionStatus: "error" }), /Geschützte oder beschädigte/);
  assert.throws(() => splitAiSource(text("x".repeat(400_001))), /höchstens 400\.000 Zeichen/);
  const big = new File(["x"], "gross.pdf");
  Object.defineProperty(big, "size", { value: 20 * 1_024 * 1_024 + 1 });
  await assert.rejects(readAiSource({ sourceMode: "file", sourceText: "", file: big }), /bis 20 MiB/);
  const read = await readAiSource({ sourceMode: "file", sourceText: "", file: new File(["Begriff,Erklärung\nATP,Energieträger"], "liste.csv") });
  assert.deepEqual(read.units, [{ label: "Zeile 2", text: "Begriff,Erklärung\nATP,Energieträger" }]);
  assert.deepEqual((await readAiSource({ sourceMode: "text", sourceText: "Eingefügt.", file: null })).units, [{ label: "Zeile 1", text: "Eingefügt." }]);
});

const unit = (index: number, size = 4_000): SourceUnit => ({ label: `Seite ${index}`, text: "x".repeat(size) });
const card = (front: string, sources = ["s1"]): GeneratedSourceCard => ({ form: "basic", front, back: "Antwort", options: [], explanation: "", sources });
/** Every request the run builds must pass the route's own validation. */
const checked = (respond: AiSourceCardsRequester): AiSourceCardsRequester => (body, signal) => respond(parseAiSourceCardsRequest(body), signal);

test("Der Lauf sendet Abschnitte nacheinander mit bisherigen Fragen und Restlimit und belegt Vorschläge mit ihren Stellen", async () => {
  const requests: Array<{ ids: string[]; avoid: string[]; limit: number }> = [];
  const progress: string[] = [];
  const request = checked(async (body) => {
    requests.push({ ids: body.units.map((item) => item.id), avoid: body.avoid, limit: body.limit });
    return { cards: [card(`Frage zu ${body.units[1]?.label ?? body.units[0].label}?`, [body.units.at(-1)!.id])], warnings: ["Seite 2 ist knapp.", ...(requests.length === 2 ? ["Neu"] : [])], discarded: 1 };
  });
  const result = await runAiSourceCards({ units: [1, 2, 3, 4, 5].map((index) => unit(index)), settings, request, signal: new AbortController().signal, onProgress: ({ done, total }) => progress.push(`${done}/${total}`) });
  assert.deepEqual(requests, [
    { ids: ["s1", "s2", "s3"], avoid: [], limit: 100 },
    { ids: ["s1", "s2"], avoid: ["Frage zu Seite 2?"], limit: 99 },
  ]);
  assert.deepEqual(progress, ["0/2", "1/2", "2/2"]);
  assert.deepEqual(result.proposals.map(({ id, sourceLabels }) => ({ id, sourceLabels })), [{ id: "p1", sourceLabels: ["Seite 3"] }, { id: "p2", sourceLabels: ["Seite 5"] }]);
  assert.deepEqual(result.warnings, ["Seite 2 ist knapp.", "Neu"]);
  assert.equal(result.discarded, 2);
  assert.equal(result.stopped, null);
  assert.deepEqual(describeAiSourceCardsRun(result), ["2 Vorschläge wurden verworfen: ungültig, doppelt oder über der Obergrenze."]);
  const many: number[] = [];
  await runAiSourceCards({ units: Array.from({ length: 201 }, (_, index) => unit(index + 1, 10)), settings, signal: new AbortController().signal, request: checked(async (body) => { many.push(body.units.length); return { cards: [], warnings: [], discarded: 0 }; }) });
  assert.deepEqual(many, [200, 1]);
});

test("Bei 100 Vorschlägen endet der Lauf und nennt die erste nicht ausgewertete Stelle", async () => {
  const request = checked(async (body) => ({ cards: Array.from({ length: Math.min(body.limit, 25) }, (_, index) => card(`${body.units[0].label} ${index}?`)), warnings: [], discarded: 0 }));
  const result = await runAiSourceCards({ units: Array.from({ length: 18 }, (_, index) => unit(index + 1)), settings, request, signal: new AbortController().signal });
  assert.equal(result.proposals.length, 100);
  assert.deepEqual(result.stopped, { reason: "limit", from: "Seite 13" });
  assert.deepEqual(describeAiSourceCardsRun(result), ["Die Obergrenze von 100 Vorschlägen ist erreicht. Ab Seite 13 wurde die Quelle nicht ausgewertet."]);
});

test("Abbruch behält Erhaltenes, Fehler einzelner Abschnitte werden genannt, Fehler für alle stoppen den Lauf", async () => {
  const controller = new AbortController();
  const cancelled = await runAiSourceCards({ units: [1, 2, 3, 4].map((index) => unit(index)), settings, signal: controller.signal, request: async (body) => {
    controller.abort();
    return { cards: [card(`Frage ${body.units[0].label}?`)], warnings: [], discarded: 0 };
  } });
  assert.equal(cancelled.proposals.length, 1);
  assert.deepEqual(cancelled.stopped, { reason: "cancelled", from: "Seite 4" });

  let calls = 0;
  const units = Array.from({ length: 9 }, (_, index) => unit(index + 1));
  const failing = await runAiSourceCards({ units, settings, signal: new AbortController().signal, request: async (body) => {
    calls += 1;
    if (calls === 1) throw new AiSourceCardsError("invalid_response", "Die KI hat keine gültigen Kartenvorschläge geliefert.");
    if (calls === 2) return { cards: [card(`Frage ${body.units[0].label}?`)], warnings: [], discarded: 0 };
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
  const empty = await runAiSourceCards({ units: [unit(1)], settings, signal: new AbortController().signal, request: async () => ({ cards: [], warnings: [], discarded: 1 }) });
  assert.deepEqual(describeAiSourceCardsRun(empty), ["1 Vorschlag wurde verworfen: ungültig, doppelt oder über der Obergrenze.", "Die Quelle ergab keine Kartenvorschläge."]);
});

const okResponse = (cards: GeneratedSourceCard[]) => ({ cards, warnings: [], discarded: 0, model: "openai/gpt-6-luna", privacyMode: "zdr", promptVersion: "source-cards-v1", usage: null });

test("Der Abruf sendet die Sitzung mit und prüft die Antwort gegen Anfrage und Vertrag", async () => {
  const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: "session-test" } }, error: null }) } } as unknown as NonNullable<Parameters<typeof requestAiSourceCards>[1]>;
  const request = { settings, units: [{ id: "s1", label: "Seite 1", text: "ATP ist ein Energieträger." }], avoid: [], limit: 2 };
  const signal = new AbortController().signal;
  const result = await requestAiSourceCards(request, supabase, signal, async (url, init) => {
    assert.equal(url, "/api/ai/source-cards");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer session-test");
    assert.deepEqual(JSON.parse(String(init?.body)), request);
    return new Response(JSON.stringify(okResponse([card("Was ist ATP?")])));
  });
  assert.deepEqual(result, { cards: [card("Was ist ATP?")], warnings: [], discarded: 0 });
  await assert.rejects(requestAiSourceCards(request, null, signal), (error: Error & { code?: string }) => error.code === "auth_unavailable");
  const twoCorrect = { ...card("Welche?"), form: "single-choice" as const, back: "", options: [{ text: "A", correct: true }, { text: "B", correct: true }] };
  for (const cards of [[card("Unbekannt?", ["s9"])], [card("A?"), card("B?"), card("C?")], [{ ...card("Form?"), form: "cloze" as const, front: "{{c1::x}}", back: "" }], [twoCorrect]]) {
    const restricted = { ...request, settings: { ...settings, cardForms: cards[0] === twoCorrect ? ["single-choice" as const] : ["basic" as const] } };
    await assert.rejects(requestAiSourceCards(restricted, supabase, signal, async () => new Response(JSON.stringify(okResponse(cards)))), /keine gültigen Kartenvorschläge/);
  }
  await assert.rejects(requestAiSourceCards(request, supabase, signal, async () => new Response(JSON.stringify({ error: { code: "rate_limited", message: "Später erneut versuchen." } }), { status: 429 })), (error: Error & { code?: string }) => error.code === "rate_limited");
});

test("Vorschläge werden zu gültigen Inhalten: Antwort, Erklärung und Stelle in getrennten Feldern, Text bleibt Text", () => {
  const place = (proposal: GeneratedSourceCard) => ({ ...proposal, id: "p1", sourceLabels: ["Seite 2", "Seite 3"] });
  const basic = proposalNoteContent(place({ ...card("Was ist <ATP>?"), explanation: "Trägt Energie.\nIn jeder Zelle." }), "skript.pdf");
  assert.deepEqual(basic.fields.map(({ name, role, html }) => [name, role, html]), [
    ["Vorderseite", "prompt", "Was ist &lt;ATP&gt;?"],
    ["Rückseite", "answer", "Antwort"],
    ["Erklärung", "extra", "Trägt Energie.<br>In jeder Zelle."],
    ["Quelle", "source", "skript.pdf · Seite 2; Seite 3"],
  ]);
  const cloze = proposalNoteContent(place({ form: "cloze", front: "ATP liegt in der {{c1::Zelle}}.", back: "", options: [], explanation: "", sources: ["s1"] }), "Eingefügter Text");
  assert.equal(cloze.interaction.kind, "cloze");
  assert.deepEqual(cloze.fields.map(({ role, html }) => [role, html]), [["prompt", "ATP liegt in der {{c1::Zelle}}."], ["extra", ""], ["source", "Eingefügter Text · Seite 2; Seite 3"]]);
  const choice = proposalNoteContent(place({ form: "multiple-choice", front: "Was gilt?", back: "", options: [{ text: "A & B", correct: true }, { text: "C", correct: false }], explanation: "Weil.", sources: ["s1"] }), "x.md");
  assert.deepEqual(choice.interaction.kind === "choice" && choice.interaction.options.map(({ html, correct }) => [html, correct]), [["A &amp; B", true], ["C", false]]);
  for (const content of [basic, cloze, choice]) assert.equal(createNote({ content, deckId: "deck" }).cards.length, 1);
});

test("Übernahme speichert nacheinander, der erste Vorschlag legt den Stapel an, ein Fehler hält an und nennt den Stand", async () => {
  const content = proposalNoteContent({ ...card("Was ist ATP?"), id: "p1", sourceLabels: ["Seite 1"] }, "skript.pdf");
  const proposals = ["p1", "p2", "p3"].map((id) => ({ id, content }));
  const calls: Array<string | null> = [];
  const save = async ({ deckId }: { deckId: string | null }) => {
    calls.push(deckId);
    if (calls.length === 3) return null;
    return { deck: { id: "deck-neu" }, cardIds: ["card"] };
  };
  assert.deepEqual(await saveProposals(proposals, { deckId: null, deckName: "Skript" }, save), { deckId: "deck-neu", saved: 2, createdCards: 2, error: "Die Karte konnte nicht gespeichert werden." });
  assert.deepEqual(calls, [null, "deck-neu", "deck-neu"]);
  const thrown = await saveProposals(proposals, { deckId: "deck-alt", deckName: "Skript" }, async () => { throw new Error("Speicher voll."); });
  assert.deepEqual(thrown, { deckId: "deck-alt", saved: 0, createdCards: 0, error: "Speicher voll." });
  assert.deepEqual(await saveProposals(proposals, { deckId: "deck-alt", deckName: "Skript" }, async () => ({ deck: { id: "deck-alt" }, cardIds: ["a", "b"] })), { deckId: "deck-alt", saved: 3, createdCards: 6, error: null });
});

test("Eine Wiederholung der Übernahme bleibt im gewählten oder im zuvor angelegten Stapel", async () => {
  const decks = [
    { id: "alt", name: "Skript", parentDeckId: null, deletedAt: null },
    { id: "neu", name: "Skript 2", parentDeckId: null, deletedAt: null },
    { id: "unter", name: "Skript", parentDeckId: "alt", deletedAt: null },
    { id: "weg", name: "Gelöscht", parentDeckId: null, deletedAt: "2026-11-19T00:00:00.000Z" },
  ];
  const before = new Set(["alt", "unter", "weg"]);
  assert.equal(adoptionDeckId(decks, "alt", "Skript", before), "alt");
  assert.equal(adoptionDeckId(decks, null, "Skript", before), "neu");
  assert.equal(adoptionDeckId(decks, "weg", "Skript", before), "neu");
  assert.equal(adoptionDeckId(decks, null, "Skript", new Set(decks.map((deck) => deck.id))), null);
  assert.equal(adoptionDeckId(decks, "fehlt", "Anderes", before), null);
});
