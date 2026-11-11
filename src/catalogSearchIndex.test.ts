import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogSearchIndex } from "./catalogSearchIndex.ts";
import type { CardTableSort } from "./libraryModel.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";

const sorts: CardTableSort[] = (["sortField", "nextStudyDate", "variants"] as const).flatMap((field) => (
  (["asc", "desc"] as const).map((direction) => ({ field, direction }))
));

test("einzelne Änderungen ergeben dieselben Reihenfolgen wie ein Neuaufbau", () => {
  let seed = 11;
  const random = (limit: number) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed % limit;
  };
  // Few distinct sort keys, so equal keys and the id tie-break are common.
  const entry = (id: number): CardCatalogEntry => {
    const word = ["alpha", "beta", "gamma", "delta"][random(4)];
    return {
      id: `card-${id}`, deckId: `deck-${random(3)}`, noteId: `note-${id}`, frontPreview: word,
      normalizedSearchText: `${word} ${random(1_000)}`, sortText: word,
      dueAt: random(4) === 0 ? null : `2026-11-${String(1 + random(3)).padStart(2, "0")}T00:00:00.000Z`,
      scheduleState: "review", maturityBand: "young", reviewable: true, marked: false, ankiFlag: 0, leeched: false, tagKeys: [],
      hasActiveVariants: random(2) === 0, activeVariantCount: 0, activeVariantId: null, bodyRevision: 1, studyRevision: 1,
      dependencyRevision: 1, syncChangeId: id, deletedAt: random(15) === 0 ? "2026-11-04T00:00:00.000Z" : null,
      updatedAt: "2026-11-04T00:00:00.000Z",
    };
  };
  const all = (index: ReturnType<typeof createCatalogSearchIndex>, query: string, sort: CardTableSort) => (
    index.slice(query, sort, undefined, null, 0, Number.MAX_SAFE_INTEGER).items
  );

  const live = new Map<string, CardCatalogEntry>();
  const index = createCatalogSearchIndex();
  const initial = Array.from({ length: 60 }, (_, id) => entry(id));
  for (const row of initial) if (!row.deletedAt) live.set(row.id, row);
  index.replaceAll(initial);
  for (let step = 0; step < 600; step += 1) {
    const id = random(80);
    if (random(6) === 0) {
      index.remove(`card-${id}`);
      live.delete(`card-${id}`);
    } else {
      const row = entry(id);
      index.put(row);
      if (row.deletedAt) live.delete(row.id);
      else live.set(row.id, row);
    }
    if (step % 7 !== 0) continue;
    const rebuilt = createCatalogSearchIndex();
    rebuilt.replaceAll(live.values());
    for (const sort of sorts) {
      for (const query of ["", "alpha"]) assert.deepEqual(all(index, query, sort), all(rebuilt, query, sort), `Schritt ${step}, ${sort.field} ${sort.direction}, „${query}“`);
    }
  }
});
