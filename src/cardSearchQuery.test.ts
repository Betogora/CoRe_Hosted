import assert from "node:assert/strict";
import test from "node:test";
import { matchesCardSearch, parseCardSearchQuery, readCardSearchFilters, unsupportedCardSearchTerms, withCardSearchFilter } from "./cardSearchQuery.ts";

const entry = (overrides: Partial<Parameters<typeof matchesCardSearch>[0]> = {}) => ({
  normalizedSearchText: "die mitochondrien liefern energie",
  ankiFlag: 0,
  tagKeys: [] as string[],
  leeched: false,
  marked: false,
  reviewable: true,
  ...overrides,
});

test("Suchbegriffe in Anki-Schreibweise werden zu Filtern, der Rest bleibt Text", () => {
  assert.deepEqual(parseCardSearchQuery("  Mitochondrien flag:2 -tag:#AK::Herz tag:none TAG:Leech tag:marked -is:suspended flag:9 is:new "), {
    text: "mitochondrien flag:9 is:new",
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

test("filters write and read the search terms and keep text and other terms", () => {
  let query = "herz -flag:2 is:suspended";
  query = withCardSearchFilter(query, "flag", 3);
  query = withCardSearchFilter(query, "leech", true);
  query = withCardSearchFilter(query, "tags", ["Kardio::Klappen", "#AK"]);
  assert.equal(query, "herz -flag:2 is:suspended flag:3 tag:leech tag:Kardio::Klappen tag:#AK");
  assert.deepEqual(readCardSearchFilters(query), { flag: 3, leech: true, tags: ["Kardio::Klappen", "#AK"] });
  assert.equal(withCardSearchFilter(withCardSearchFilter(query, "flag", null), "tags", []), "herz -flag:2 is:suspended tag:leech");
  assert.equal(withCardSearchFilter("flag:1", "flag", 0), "flag:0");
  assert.deepEqual(readCardSearchFilters(withCardSearchFilter("", "leech", false)), { flag: null, leech: false, tags: [] });
});

test("Nicht unterstützte Anki-Begriffe werden benannt, normaler Text mit Doppelpunkt nicht", () => {
  assert.deepEqual(unsupportedCardSearchTerms("is:due -deck:Physik flag:9 prop:ivl>3 Ursprung:scaleni https://x.de flag:1 tag:herz is:suspended"), ["is:due", "-deck:Physik", "flag:9", "prop:ivl>3"]);
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
