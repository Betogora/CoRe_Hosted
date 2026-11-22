import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { CardEditorServices } from "../../appScreenProps.ts";
import { addCardVariant, createBasicNote, createCoreDeck, createManualNoteContent, createNote, noteEditorValue, planNoteContentChange, validateNoteEditorValue } from "../../coreModel.ts";
import { AI_CARD_VARIANT_PROMPT_VERSION } from "../../aiCardVariantContract.ts";
import { editVariantText } from "../../coreVariantService.ts";
import type { CardStudyStatePatch } from "../../coreTypes.ts";
import { cardEditorTitle, changeSuspension, draftChangeSummary, variantStateMarks } from "./cardEditorModel.ts";
import { draftBaseGraph } from "./CardEditorContentTab.tsx";
import { CardEditorStudyTab } from "./CardEditorStudyTab.tsx";
import { CardEditorVariantsTab } from "./CardEditorVariantsTab.tsx";
import { RetrievabilityChart } from "./RetrievabilityChart.tsx";

const NOW = "2026-08-06T10:00:00.000Z";
const services: CardEditorServices = {
  flagNames: [],
  moveCard: async () => null,
  resetCards: async () => [],
  setCardsLeech: async () => [],
  buryCards: async () => [],
  restoreCardStudies: async () => [],
  editVariant: async () => undefined,
  removeNoteMedia: async () => null,
  loadCard: async () => null,
  listReviewEvents: async () => [],
  listTagDirectory: async () => [],
  listNoteTypes: async () => [],
  listExamsForDeck: async () => [],
  prefetchCard: () => undefined,
  cloud: null,
  openFlagNames: () => undefined,
  openSyncConflicts: () => undefined,
};

function renderVariants(card = createBasicNote("deck", "Was ist ATP?", "Ein Energieträger.").cards[0]) {
  const graph = createBasicNote("deck", "Was ist ATP?", "Ein Energieträger.");
  const deck = createCoreDeck({ id: "deck", name: "Biologie", source: "manual", cards: [card] });
  return renderToStaticMarkup(<CardEditorVariantsTab deck={deck} note={graph.note} card={card} services={services} onGenerateVariant={async () => undefined} onUpdateVariant={async () => undefined} onOpenDeckSettings={() => undefined} />);
}

test("the variants tab shows the original, state marks and one row of actions per variant", () => {
  const card = addCardVariant(createBasicNote("deck", "Was ist ATP?", "Ein Energieträger.").cards[0], { front: "Wofür steht ATP?", back: "Energie", qualityStatus: "active", isActive: true });
  const markup = renderVariants(card);
  assert.match(markup, />Original<\/h3><\/div><div[^>]*><p[^>]*>Was ist ATP\?</);
  assert.match(markup, />aktiv<\/span><span[^>]*>als Nächstes</);
  for (const label of ["bearbeiten", "neu generieren", "ausschließen", "löschen"]) assert.match(markup, new RegExp(`aria-label="Variante 1 ${label}"`));
  assert.doesNotMatch(markup, /reaktivieren/);
  assert.match(markup, /data-testid="variant-readiness"[^>]*>Haltbarkeit 0 von \d+ Tagen · /);
  assert.match(markup, /Stapeleinstellungen/);
  assert.match(markup, />Weitere Variante generieren</);
});

test("a typed card's variant row shows the card's own answer, which the review asks for, not an older rephrased one", () => {
  const typed = createNote({ deckId: "deck", content: createManualNoteContent({ kind: "basic", front: "Symbol für Gold?", back: "Au", typeIn: true }) });
  const card = addCardVariant(typed.cards[0], { front: "Welches Elementsymbol hat Gold?", back: "Gold hat das Symbol Au" });
  const deck = createCoreDeck({ id: "deck", name: "Chemie", source: "manual", cards: [card] });
  const markup = renderToStaticMarkup(<CardEditorVariantsTab deck={deck} note={typed.note} card={card} services={services} onGenerateVariant={async () => undefined} onUpdateVariant={async () => undefined} onOpenDeckSettings={() => undefined} />);
  assert.match(markup, />Welches Elementsymbol hat Gold\?<\/p><p[^>]*>Au<\/p>/);
  assert.doesNotMatch(markup, /Gold hat das Symbol Au/);
});

test("reported, excluded and outdated variants carry their marks; edited ones and the next one say so", () => {
  const base = addCardVariant(createBasicNote("deck", "Was ist ATP?", "Ein Energieträger.").cards[0], { front: "Wofür steht ATP?", back: "Energie", qualityStatus: "active", isActive: true });
  const reported = { ...base, variants: base.variants.map((variant) => ({ ...variant, isActive: false, qualityStatus: "flagged" as const, feedback: [{ id: "f", type: "unklar_formuliert" as const, note: "", createdAt: NOW }] })) };
  const reportedMarkup = renderVariants(reported);
  assert.match(reportedMarkup, />gemeldet: unklar formuliert</);
  assert.match(reportedMarkup, /data-testid="variant-active-count"[^>]*>0 von \d+ aktiv</);
  assert.match(reportedMarkup, /aria-label="Variante 1 wieder aufnehmen"/);

  const outdated = { ...base, variants: base.variants.map((variant) => ({ ...variant, isActive: false, meta: { ...variant.meta, outdated: true } })) };
  const outdatedMarkup = renderVariants(outdated);
  assert.match(outdatedMarkup, />veraltet</);
  assert.match(outdatedMarkup, />Variante neu generieren</);

  const edited = editVariantText(base, base.variants[0].id, { front: "Eigene Frage", back: "Eigene Antwort" }, NOW);
  assert.deepEqual(variantStateMarks(edited.variants[0], true).marks.map((mark) => mark.label), ["aktiv", "bearbeitet"]);
  assert.deepEqual(variantStateMarks(edited.variants[0], true, true).marks.map((mark) => mark.label), ["aktiv", "als Nächstes", "bearbeitet"]);
});

test("the study tab names the nine figures, the maturity band and the leech with its time", () => {
  const card = createBasicNote("deck", "Was ist ATP?", "Ein Energieträger.").cards[0];
  const reviewed = { ...card, study: { ...card.study, state: "review" as const, reps: 9, lapses: 8, stability: 30, difficulty: 6.4, intervalDays: 21, lastReviewedAt: "2026-07-20T10:00:00.000Z", leechedAt: "2026-07-20T10:00:00.000Z", extra: { ...card.study.extra, stabilityFast: 30 } } };
  const markup = renderToStaticMarkup(<CardEditorStudyTab card={reviewed} now={NOW} services={services} />);
  const figures = markup.match(/data-testid="card-study-figures"[\s\S]*?<\/dl>/)?.[0] ?? "";
  assert.equal([...figures.matchAll(/<div class="core-card-editor-row"><dt>/g)].length, 9, "eine Zeile je Wert, Beschriftung links");
  assert.doesNotMatch(figures, /truncate/, "keine Beschriftung wird abgeschnitten");
  for (const label of ["Fällig", "Haltbarkeit", "Abrufwahrscheinlichkeit", "Schwierigkeit", "Wiederholungen", "Fehler"]) assert.match(figures, new RegExp(`>${label}<`));
  assert.match(figures, />6,4 von 10</);
  const band = markup.match(/data-testid="card-maturity-band"[\s\S]*?<\/ol>/)?.[0] ?? "";
  assert.match(markup, /class="core-card-editor-maturity" data-testid="card-maturity-band"><ol aria-label="Reifeband">/, "eine Punktlinie statt einer Schalterform");
  assert.deepEqual([...band.matchAll(/core-card-editor-maturity-dot"><\/span>([^<]+)/g)].map((match) => match[1]), ["Neu", "Lernen", "Jung", "Reif"]);
  assert.match(band, /data-state="current" aria-current="true"><span aria-hidden="true" class="core-card-editor-maturity-line"><\/span><span class="core-card-editor-maturity-step"><span aria-hidden="true" class="core-card-editor-maturity-dot"><\/span>(Jung|Reif)</);
  assert.doesNotMatch(band, /core-steps|erledigt/, "ein Zustand, keine Schrittfolge");
  assert.match(markup, /Lernbremse seit 20\.07\.2026/);
  assert.match(markup, />Lernstand zurücksetzen …</);
  assert.doesNotMatch(markup, /XP/);
});

test("the retrievability chart draws axes, target line, curve and forgotten answers as its own SVG", () => {
  const start = Date.parse("2026-04-01T00:00:00.000Z");
  const now = start + 100 * 86_400_000;
  const markup = renderToStaticMarkup(<RetrievabilityChart now={now} targetPercent={91.6} points={[
    { at: start, percent: 100 },
    { at: start + 50 * 86_400_000, percent: 72, forgotten: true },
    { at: now, percent: 81 },
  ]} />);
  assert.match(markup, /role="img" aria-label="Abrufwahrscheinlichkeit heute 81 %, Ziel 92 %, 1-mal vergessen"/);
  assert.match(markup, /tabindex="0"/);
  assert.deepEqual([...markup.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((match) => match[1]), ["70 %", "Ziel 92 %", "100 %", "April 2026", "heute"]);
  // y runs from 100 % at the top to the 70 % floor at the bottom; x from the first answer to today.
  assert.match(markup, /<path d="M0\.0,0\.0L500\.0,933\.3L1000\.0,633\.3L1000\.0,1000L0\.0,1000Z" fill="var\(--core-action-primary\)" fill-opacity="0.08"/);
  assert.match(markup, /<line x1="0" x2="100%" y1="26\.6+\d*%" y2="26\.6+\d*%" stroke="var\(--core-text-muted\)" stroke-dasharray="4 4"/);
  assert.equal([...markup.matchAll(/<circle cx="50%" cy="93\.3+\d*%" r="4" fill="var\(--core-rating-again-border\)"/g)].length, 1);
});

test("an edited draft keeps its base graph, so a synced version meets the conflict handling on save (W19)", () => {
  const graph = createBasicNote("deck", "Was ist ATP?", "Ein Energieträger.");
  const synced = { ...graph, note: { ...graph.note, revision: graph.note.revision + 1, content: { ...graph.note.content, fields: graph.note.content.fields.map((field) => field.id === "back" ? { ...field, html: "Neu von einem anderen Gerät" } : field) } } };
  assert.equal(draftBaseGraph(synced, graph, true), graph);
  assert.equal(draftBaseGraph(synced, graph, false), synced);
  const value = noteEditorValue(graph.note);
  const validation = validateNoteEditorValue(graph.note, { ...value, fields: { ...value.fields, front: "Was speichert ATP?" } });
  assert.ok(validation.ok);
  const plan = planNoteContentChange(draftBaseGraph(synced, graph, true), validation.content);
  assert.equal(plan.note.revision, graph.note.revision + 1, "the save is based on the draft's revision, not the synced one");
});

test("suspending and reactivating act at once and offer an undo that sets the earlier state again (5.2)", async () => {
  let graph = createBasicNote("deck", "Was ist ATP?", "Ein Energieträger.");
  const cardId = graph.cards[0].id;
  const patches: CardStudyStatePatch[] = [];
  const setStudyState = async (id: string, patch: CardStudyStatePatch) => {
    patches.push(patch);
    graph = { ...graph, cards: graph.cards.map((card) => card.id === id ? { ...card, status: patch.suspended ? "suspended" as const : "active" as const, revision: card.revision + 1 } : card) };
    return graph;
  };

  const suspended = await changeSuspension(setStudyState, cardId, true);
  assert.ok(suspended);
  assert.equal(suspended.message, "Karte ausgesetzt.");
  assert.equal(graph.cards[0].status, "suspended");
  assert.ok(suspended.unchanged({ card: graph.cards[0] }));
  await suspended.undo();
  assert.deepEqual(patches, [{ suspended: true }, { suspended: false }]);
  assert.equal(graph.cards[0].status, "active");

  const reactivated = await changeSuspension(setStudyState, cardId, false);
  assert.ok(reactivated);
  assert.equal(reactivated.message, "Karte reaktiviert.");
  assert.equal(reactivated.unchanged({ card: { ...graph.cards[0], revision: graph.cards[0].revision + 1 } }), false, "a card changed meanwhile keeps its state");
  assert.equal(await changeSuspension(async () => null, cardId, true), null, "a failed write offers no undo");
});

test("the footer names the effect of saving and the title is the plain question", () => {
  const graph = createBasicNote("deck", "<b>Was</b> ist ATP?", "Ein Energieträger.");
  assert.equal(cardEditorTitle(graph.note), "Was ist ATP?");
  const reverse = { ...graph.note.content, interaction: graph.note.content.interaction.kind === "reveal" ? { ...graph.note.content.interaction, prompts: [...graph.note.content.interaction.prompts, { ...graph.note.content.interaction.prompts[0], key: "reverse", name: "Rückwärts", questionFieldIds: ["back"], answerFieldIds: ["front"] }] } : graph.note.content.interaction };
  assert.equal(draftChangeSummary(graph, planNoteContentChange(graph, reverse)), "Beim Speichern: 1 neue Karte (Rückwärts).");
});

test("a refused card names why and offers to try again; a refusal of older content does not show", () => {
  const card = createBasicNote("deck", "Was ist ATP?", "Ein Energieträger.").cards[0];
  const refusal = { state: "not_rephrasable" as const, failures: 0, promptVersion: AI_CARD_VARIANT_PROMPT_VERSION, contentRevision: 1, updatedAt: NOW };
  const refused = renderVariants({ ...card, variantRefusal: refusal });
  assert.match(refused, /data-testid="variant-refusal"[^>]*>Die KI hält diese Karte für nicht umformulierbar.</);
  assert.match(refused, />Erneut versuchen</);
  assert.match(renderVariants({ ...card, variantRefusal: { ...refusal, state: "failing", failures: 3 } }), />Die Generierung ist 3-mal nacheinander gescheitert.</);
  const older = renderVariants({ ...card, variantRefusal: { ...refusal, contentRevision: 0 } });
  assert.doesNotMatch(older, /variant-refusal/);
  assert.match(older, />Variante generieren</);
});
