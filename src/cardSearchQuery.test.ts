import assert from "node:assert/strict";
import test from "node:test";
import { matchesCardSearch, parseCardSearchQuery } from "./cardSearchQuery.ts";

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
