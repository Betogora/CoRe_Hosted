import assert from "node:assert/strict";
import test from "node:test";
import {
  cardSearchDeckIds,
  cardSearchTermState,
  cardSearchTerms,
  cardSearchText,
  matchesCardSearch,
  parseCardSearchQuery,
  unsupportedCardSearchTerms,
  withCardSearchTermState,
  withCardSearchText,
} from "./cardSearchQuery.ts";

type Entry = Parameters<typeof matchesCardSearch>[0];
const entry = (overrides: Partial<Entry> = {}): Entry => ({
  normalizedSearchText: "die mitochondrien liefern energie",
  ankiFlag: 0,
  tagKeys: [] as string[],
  leeched: false,
  marked: false,
  reviewable: true,
  scheduleState: "review",
  maturityBand: "young",
  dueAt: "2026-11-05T08:00:00.000Z",
  hasActiveVariants: false,
  deckId: "deck-a",
  ...overrides,
});
const TODAY = { todayStart: Date.parse("2026-11-05T04:00:00.000Z") };

test("Suchbegriffe in Anki-Schreibweise werden zu Filtern, der Rest bleibt Text", () => {
  assert.deepEqual(parseCardSearchQuery("  Mitochondrien flag:2 -tag:#AK::Herz tag:none TAG:Leech tag:marked -is:suspended flag:9 is:frisch "), {
    text: "mitochondrien flag:9 is:frisch",
    terms: [
      { kind: "flag", value: 2, negated: false },
      { kind: "tag", value: "#ak::herz", negated: true },
      { kind: "tag-none", negated: false },
      { kind: "leech", negated: false },
      { kind: "marked", negated: false },
      { kind: "suspended", negated: true },
    ],
  });
});

test("Offline-Suche wertet Text und Begriffe wie der Server aus", () => {
  const herz = entry({ tagKeys: ["#ak", "#ak::herz", "#ak::herz::klappen"], ankiFlag: 2 });
  assert.equal(matchesCardSearch(herz, parseCardSearchQuery("tag:#AK::Herz")), true, "Kinder zählen mit");
  assert.equal(matchesCardSearch(herz, parseCardSearchQuery("tag:#AK::He")), false, "kein Teilwort");
  assert.equal(matchesCardSearch(herz, parseCardSearchQuery("flag:2 energie")), true);
  assert.equal(matchesCardSearch(herz, parseCardSearchQuery("-flag:2")), false);
  assert.equal(matchesCardSearch(herz, parseCardSearchQuery("tag:none")), false);
  assert.equal(matchesCardSearch(entry(), parseCardSearchQuery("tag:none flag:0")), true);
  assert.equal(matchesCardSearch(entry({ leeched: true, reviewable: false }), parseCardSearchQuery("tag:leech is:suspended")), true);
  assert.equal(matchesCardSearch(entry(), parseCardSearchQuery("tag:marked")), false);
});

test("Mit, Egal und Ohne schreiben einen Begriff und lassen Text und andere Begriffe stehen", () => {
  let query = "herz -flag:2";
  assert.equal(cardSearchTermState(query, "flag:2"), "out");
  assert.equal(cardSearchTermState(query, "is:due"), "");
  query = withCardSearchTermState(query, "is:due", "in");
  query = withCardSearchTermState(query, "flag:2", "in");
  assert.equal(query, "herz is:due flag:2");
  assert.equal(withCardSearchTermState(query, "IS:DUE", ""), "herz flag:2", "ohne Rücksicht auf Groß-/Kleinschreibung");
  assert.deepEqual(cardSearchTerms("herz is:due -tag:x ursprung:scaleni"), ["is:due", "-tag:x", "ursprung:scaleni"]);
  assert.equal(cardSearchText("herz is:due  lunge"), "herz lunge");
});

test("Getippte Begriffe wandern beim Leerzeichen aus dem Suchfeld zu den Filtern", () => {
  assert.deepEqual(withCardSearchText("flag:1", "herz is:du"), { query: "flag:1 herz is:du", input: "herz is:du" }, "unfertig bleibt im Feld");
  assert.deepEqual(withCardSearchText("flag:1", "herz is:due "), { query: "flag:1 is:due herz", input: "herz " });
  assert.deepEqual(withCardSearchText("", "is:new lunge"), { query: "is:new lunge", input: "lunge" });
});

test("Zustand, Reife, Varianten, Stapel und Fälligkeit werten den Lernstand aus", () => {
  const context = { ...TODAY, deckSubtrees: { "deck-a": ["deck-a", "deck-a1"] } };
  assert.equal(matchesCardSearch(entry({ scheduleState: "relearning" }), parseCardSearchQuery("is:learn", context)), true);
  assert.equal(matchesCardSearch(entry({ scheduleState: "new" }), parseCardSearchQuery("is:new -is:review", context)), true);
  assert.equal(matchesCardSearch(entry({ maturityBand: "mature" }), parseCardSearchQuery("is:mature", context)), true);
  assert.equal(matchesCardSearch(entry({ hasActiveVariants: true }), parseCardSearchQuery("-has:variant", context)), false);
  assert.equal(matchesCardSearch(entry({ deckId: "deck-a1" }), parseCardSearchQuery("did:deck-a", context)), true, "Unterstapel zählen mit");
  assert.equal(matchesCardSearch(entry({ deckId: "deck-b" }), parseCardSearchQuery("did:deck-a", context)), false);
  assert.deepEqual(cardSearchDeckIds("did:deck-a -did:deck-b did:deck-a herz"), ["deck-a", "deck-b"]);
  // Today runs from 04:00 to 04:00 the next day.
  assert.equal(matchesCardSearch(entry({ dueAt: "2026-11-06T03:59:00.000Z" }), parseCardSearchQuery("is:due", context)), true);
  assert.equal(matchesCardSearch(entry({ dueAt: "2026-11-06T04:00:00.000Z" }), parseCardSearchQuery("is:due", context)), false);
  assert.equal(matchesCardSearch(entry({ reviewable: false }), parseCardSearchQuery("is:due", context)), false, "ausgesetzt ist nicht fällig");
  assert.equal(matchesCardSearch(entry({ scheduleState: "new" }), parseCardSearchQuery("is:due", context)), false, "neu ist nicht fällig");
  assert.equal(matchesCardSearch(entry({ dueAt: "2026-11-03T08:00:00.000Z" }), parseCardSearchQuery("prop:due<0", context)), true, "überfällig");
  assert.equal(matchesCardSearch(entry({}), parseCardSearchQuery("prop:due<0", context)), false);
  assert.equal(matchesCardSearch(entry({ dueAt: "2026-11-06T09:00:00.000Z" }), parseCardSearchQuery("prop:due=1", context)), true, "morgen");
  assert.deepEqual(parseCardSearchQuery("prop:due>=2", context).terms, [{ kind: "due", from: "2026-11-07T04:00:00.000Z", to: null, reviewableOnly: false, negated: false }]);
});

test("Nicht unterstützte Anki-Begriffe werden benannt, normaler Text mit Doppelpunkt nicht", () => {
  assert.deepEqual(unsupportedCardSearchTerms("is:due -deck:Physik flag:9 prop:ivl>3 Ursprung:scaleni https://x.de flag:1 tag:herz is:suspended has:x"), ["-deck:Physik", "flag:9", "prop:ivl>3", "has:x"]);
  assert.deepEqual(unsupportedCardSearchTerms(""), []);
});

test("Feld:Text sucht nur im genannten Feld, verneint auch außerhalb", () => {
  const search = parseCardSearchQuery("Ursprung:Scaleni -Back_Extra:merke muskel");
  assert.deepEqual(search, {
    text: "muskel",
    terms: [
      { kind: "field", name: "ursprung", value: "scaleni", negated: false },
      { kind: "field", name: "back_extra", value: "merke", negated: true },
    ],
  });
  const card = { ...entry(), normalizedSearchText: "muskel scaleni", searchFields: [{ name: "ursprung", text: "mm. scaleni" }, { name: "back_extra", text: "nichts" }] };
  assert.equal(matchesCardSearch(card, search), true);
  assert.equal(matchesCardSearch({ ...card, searchFields: [{ name: "ansatz", text: "mm. scaleni" }] }, search), false, "anderes Feld");
  assert.equal(matchesCardSearch({ ...card, searchFields: undefined }, parseCardSearchQuery("ursprung:scaleni")), false, "ohne Feldtexte kein Treffer");
});
