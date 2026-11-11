import { performance } from "node:perf_hooks";
import { createCatalogSearchIndex } from "../src/catalogSearchIndex.ts";
import type { CardTableSort } from "../src/libraryModel.ts";
import type { CardCatalogEntry } from "../src/workspaceReplica.ts";

// KV1-Budget der Kartenverwaltung (ADR-048): 50.000 Karten, 25.000 Inhalte mit rund 400 Zeichen.
const cardCount = 50_000;
const noteCount = 25_000;
const deckCount = 60;
const runs = 30;
const SEARCH_BUDGET_MS = 100;
const FIRST_SEARCH_BUDGET_MS = 250;

const words = "muskel nerv arterie vene ursprung ansatz innervation funktion trapezius scaleni plexus brachialis femur tibia herz lunge niere leber milz magen darm hormon enzym zelle membran mitochondrien ribosom protein lipid glukose".split(" ");
let seed = 7;
const random = (limit: number) => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed % limit;
};
const sentence = (length: number) => Array.from({ length }, () => words[random(words.length)]).join(" ");
const notes = Array.from({ length: noteCount }, () => {
  const front = sentence(8);
  const back = sentence(50);
  return { searchText: `${front} ${back}`, sortText: front, searchFields: [{ name: "vorderseite", text: front }, { name: "rückseite", text: back }] };
});
const entries: CardCatalogEntry[] = Array.from({ length: cardCount }, (_, index) => {
  const note = notes[index % noteCount];
  return {
    id: `card-${index}`, deckId: `deck-${index % deckCount}`, noteId: `note-${index % noteCount}`, frontPreview: note.sortText,
    normalizedSearchText: note.searchText, searchFields: note.searchFields, sortText: note.sortText,
    dueAt: new Date(Date.UTC(2026, 10, 1 + random(365))).toISOString(), scheduleState: "review", maturityBand: "young",
    reviewable: random(20) !== 0, marked: random(10) === 0, ankiFlag: random(8), leeched: random(50) === 0, tagKeys: random(3) ? ["anatomie"] : [],
    hasActiveVariants: random(4) === 0, activeVariantCount: 0, activeVariantId: null, bodyRevision: 1, studyRevision: 1, dependencyRevision: 1,
    syncChangeId: index + 1, deletedAt: null, updatedAt: "2026-11-04T00:00:00.000Z",
  };
});

const queries = ["muskel", "trapezius scaleni", "xyz", "flag:1 nerv", "-tag:anatomie herz", "rückseite:plexus", "is:suspended", "a"];
const sorts: CardTableSort[] = [{ field: "sortField", direction: "asc" }, { field: "nextStudyDate", direction: "desc" }];
const index = createCatalogSearchIndex();
index.replaceAll(entries);

const time = (run: () => void) => {
  const started = performance.now();
  run();
  return performance.now() - started;
};
const percentile = (values: number[], share: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * share))];

const firstSearch = time(() => index.search("muskel", sorts[0]));
const durations: number[] = [];
for (let run = 0; run < runs; run += 1) {
  // A changed card invalidates orders and results, as an edit does before the next search.
  index.put({ ...entries[run], sortText: `${entries[run].sortText} ${run}` });
  for (const sort of sorts) {
    for (const query of queries) durations.push(time(() => index.search(query, sort)));
  }
}
const p95 = percentile(durations, 0.95);
const median = percentile(durations, 0.5);
console.log(`Kartensuche: ${cardCount.toLocaleString("de-DE")} Karten, erste Suche ${firstSearch.toFixed(1)} ms, Median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`);
const failures = [
  firstSearch > FIRST_SEARCH_BUDGET_MS ? `erste Suche ${firstSearch.toFixed(1)} ms > ${FIRST_SEARCH_BUDGET_MS} ms` : null,
  p95 > SEARCH_BUDGET_MS ? `p95 ${p95.toFixed(1)} ms > ${SEARCH_BUDGET_MS} ms` : null,
].filter(Boolean);
if (failures.length) {
  console.error(`Budget überschritten: ${failures.join(", ")}`);
  process.exit(1);
}
