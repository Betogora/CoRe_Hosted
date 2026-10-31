import assert from "node:assert/strict";
import test from "node:test";
import { AI_CARD_VARIANT_PROMPT_VERSION, AiCardVariantContractError } from "./aiCardVariantContract.ts";
import { runCardVariantBatch, summarizeCardVariantBatch, type CardVariantBatchProgress } from "./cardVariantBatch.ts";
import { addCardVariant, createBasicNote, createManualNoteContent, createNote } from "./coreModel.ts";
import type { Card, Note } from "./coreTypes.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";

type Body = { card: Card; note: Note };

function basic(index: number): Body {
  const { note, cards } = createBasicNote("deck-1", `Frage ${index}`, `Antwort ${index}`);
  return { note, card: { ...cards[0], id: `card-${index}` } };
}

function cloze(index: number): Body {
  const { note, cards } = createNote({ deckId: "deck-1", content: createManualNoteContent({ kind: "cloze", front: "Die {{c1::Mitochondrien}} liefern Energie.", back: "" }) });
  return { note, card: { ...cards[0], id: `card-${index}` } };
}

function entry(body: Body, overrides: Partial<CardCatalogEntry> = {}): CardCatalogEntry {
  return { id: body.card.id, frontPreview: `Vorschau ${body.card.id}`, hasActiveVariants: false, deletedAt: null, ...overrides } as CardCatalogEntry;
}

/** A deck split into catalog pages of the given size; the bodies are served by id. */
function deck(bodies: Body[], pageSize = 3, overrides: Record<string, Partial<CardCatalogEntry>> = {}) {
  const opened: string[][] = [];
  const byId = new Map(bodies.map((body) => [body.card.id, body]));
  return {
    opened,
    source: {
      listPage: async (page: number) => ({
        items: bodies.slice(page * pageSize, (page + 1) * pageSize).map((body) => entry(body, overrides[body.card.id])),
        hasMore: (page + 1) * pageSize < bodies.length,
      }),
      openCards: async (ids: string[]) => {
        opened.push(ids);
        return ids.map((id) => byId.get(id) ?? null);
      },
    },
  };
}

const coreOn = { coreMode: "on" as const, maxActiveVariantsPerCard: 2 };

test("batch generates the first cards without an active variant in deck order and skips ineligible ones", async () => {
  const bodies = [basic(1), cloze(2), basic(3), basic(4), basic(5)];
  const { source, opened } = deck(bodies, 3, { "card-3": { hasActiveVariants: true } });
  const generated: string[] = [];
  const progress: CardVariantBatchProgress[] = [];

  const result = await runCardVariantBatch({ source, deckSettings: coreOn, generate: async (id) => { generated.push(id); }, onProgress: (p) => progress.push(p) });

  assert.deepEqual(generated, ["card-1", "card-4", "card-5"]);
  assert.deepEqual(opened, [["card-1", "card-2"], ["card-4", "card-5"]], "only cards without an active variant are loaded");
  assert.equal(result.created, 3);
  assert.equal(result.hasMore, false);
  assert.equal(result.stopped, null);
  assert.deepEqual(progress.at(0), { phase: "selecting" });
  assert.deepEqual(progress.at(-1), { phase: "generating", done: 3, total: 3 });
});

test("batch stops selecting at the request limit and reports remaining cards", async () => {
  const { source, opened } = deck([1, 2, 3, 4, 5, 6, 7].map(basic), 3);
  const generated: string[] = [];

  const result = await runCardVariantBatch({ source, deckSettings: coreOn, generate: async (id) => { generated.push(id); }, limit: 2 });

  assert.deepEqual(generated, ["card-1", "card-2"]);
  assert.equal(opened.length, 1, "no further page is loaded once the limit is reached");
  assert.equal(result.hasMore, true);
});

test("batch keeps going after a single failed card but stops at errors every card would hit", async () => {
  const failing = deck([1, 2, 3].map(basic));
  const single = await runCardVariantBatch({
    source: failing.source,
    deckSettings: coreOn,
    generate: async (id) => { if (id === "card-2") throw new AiCardVariantContractError("invalid_tool_call", "Das Modell hat ungültige Kartenfelder geliefert."); },
  });
  assert.equal(single.created, 2);
  assert.equal(single.failed, 1);
  assert.equal(single.stopped, null);

  let calls = 0;
  const budget = await runCardVariantBatch({
    source: deck([1, 2, 3].map(basic)).source,
    deckSettings: coreOn,
    generate: async () => { calls += 1; throw new AiCardVariantContractError("provider_budget_exhausted", "Varianten können gerade nicht generiert werden."); },
  });
  assert.equal(calls, 1);
  assert.deepEqual(budget.stopped, { reason: "error", message: "Varianten können gerade nicht generiert werden." });
  assert.equal(budget.hasMore, true);
});

test("cancelling keeps the variants created so far and leaves the rest for the next action", async () => {
  const controller = new AbortController();
  const generated: string[] = [];
  const result = await runCardVariantBatch({
    source: deck([1, 2, 3].map(basic)).source,
    deckSettings: coreOn,
    signal: controller.signal,
    generate: async (id) => { generated.push(id); if (id === "card-1") controller.abort(); },
  });

  assert.deepEqual(generated, ["card-1"]);
  assert.equal(result.created, 1);
  assert.deepEqual(result.stopped, { reason: "cancelled" });
  assert.equal(result.hasMore, true);
});

test("a card whose loaded body already has a variant is skipped even when the catalog lags behind", async () => {
  const withVariant = basic(1);
  withVariant.card = addCardVariant(withVariant.card, { front: "Neu gefragt", back: "Antwort 1" });
  const generated: string[] = [];
  const result = await runCardVariantBatch({ source: deck([withVariant, basic(2)]).source, deckSettings: coreOn, generate: async (id) => { generated.push(id); } });
  assert.deepEqual(generated, ["card-2"]);
  assert.equal(result.created, 1);
});

test("a deck with CoRe switched off creates nothing", async () => {
  let calls = 0;
  const result = await runCardVariantBatch({ source: deck([1, 2].map(basic)).source, deckSettings: { coreMode: "off" }, generate: async () => { calls += 1; } });
  assert.equal(calls, 0);
  assert.equal(result.created, 0);
});

test("summary sends clean results to a toast and keeps failures and stops in the bar", () => {
  const base = { created: 3, failed: 0, stopped: null, hasMore: false };
  assert.deepEqual(summarizeCardVariantBatch(base), { kind: "toast", message: "3 Varianten generiert." });
  assert.deepEqual(summarizeCardVariantBatch({ ...base, created: 50, hasMore: true }), { kind: "toast", message: "50 Varianten generiert. Für weitere Karten erneut starten." });
  assert.deepEqual(summarizeCardVariantBatch({ ...base, created: 0 }), { kind: "toast", message: "Keine Karte ohne Variante gefunden." });
  assert.deepEqual(summarizeCardVariantBatch({ ...base, created: 1, stopped: { reason: "cancelled" } }), { kind: "toast", message: "Abgebrochen. 1 Variante generiert." });
  assert.deepEqual(summarizeCardVariantBatch({ ...base, failed: 1 }), { kind: "bar", message: "3 Varianten generiert, 1 fehlgeschlagen" });
  assert.deepEqual(summarizeCardVariantBatch({ ...base, created: 2, stopped: { reason: "error", message: "Varianten können gerade nicht generiert werden." } }), { kind: "bar", message: "Gestoppt nach 2 Varianten: Varianten können gerade nicht generiert werden." });
});

test("refresh replaces only variants from an older prompt version and ignores the deck maximum", async () => {
  const outdated = basic(1);
  outdated.card = addCardVariant(addCardVariant(outdated.card, { front: "Alt A", back: "Antwort 1", meta: { promptVersion: "card-variant-v2" } }), { front: "Alt B", back: "Antwort 1", meta: { promptVersion: "card-variant-v2" } });
  const current = basic(2);
  current.card = addCardVariant(current.card, { front: "Neu", back: "Antwort 2", meta: { promptVersion: AI_CARD_VARIANT_PROMPT_VERSION } });
  const withoutVariant = basic(3);
  const edited = basic(4);
  edited.card = addCardVariant(edited.card, { front: "Eigene", back: "Antwort 4", meta: { promptVersion: "card-variant-v2", editedAt: "2026-10-30T12:00:00.000Z" } });
  const generated: string[] = [];

  const result = await runCardVariantBatch({
    source: deck([outdated, current, withoutVariant, edited], 4, { "card-1": { hasActiveVariants: true }, "card-2": { hasActiveVariants: true }, "card-4": { hasActiveVariants: true } }).source,
    deckSettings: coreOn,
    mode: "refresh",
    generate: async (id) => { generated.push(id); },
  });

  assert.deepEqual(generated, ["card-1"], "eine bearbeitete Variante gilt nie als veraltet");
  assert.deepEqual(summarizeCardVariantBatch(result, "refresh"), { kind: "toast", message: "1 Variante neu generiert." });
  assert.deepEqual(summarizeCardVariantBatch({ ...result, created: 0 }, "refresh"), { kind: "toast", message: "Alle Varianten stammen bereits aus der aktuellen Version." });
});
