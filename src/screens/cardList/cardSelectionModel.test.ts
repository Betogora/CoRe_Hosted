import assert from "node:assert/strict";
import test from "node:test";
import { emptyCardSelection, isCardChecked, reduceCardSelection, selectedCardIds, selectedStudyIds, selectionCount, type CardSelection, type CardSelectionEvent, type HitRows } from "./cardSelectionModel.ts";

// Position 3 is not loaded yet.
const ROWS: HitRows = new Map([[0, { id: "a" }], [1, { id: "b" }], [2, { id: "c" }], [4, { id: "e" }], [5, { id: "f" }]]);

function run(...events: CardSelectionEvent[]): CardSelection {
  return events.reduce(reduceCardSelection, emptyCardSelection("suche"));
}

const toggle = (cardId: string, range = false): CardSelectionEvent => ({ type: "toggle", cardId, range, rows: ROWS });

test("toggling checks and unchecks a card and starts the selection", () => {
  const checked = run(toggle("b"));
  assert.equal(checked.selecting, true);
  assert.deepEqual([...checked.checkedIds], ["b"]);
  assert.deepEqual([...run(toggle("b"), toggle("b")).checkedIds], [], "ein zweites Umschalten nimmt die Karte heraus");
});

test("a range checks the loaded rows between the last toggled card and this one, in either direction", () => {
  assert.deepEqual([...run(toggle("b"), toggle("f", true)).checkedIds].sort(), ["b", "c", "e", "f"], "die nicht geladene Position 3 bleibt aus");
  assert.deepEqual([...run(toggle("e"), toggle("a", true)).checkedIds].sort(), ["a", "b", "c", "e"]);
  const anchoredAgain = run(toggle("a"), toggle("c", true), toggle("f", true));
  assert.deepEqual([...anchoredAgain.checkedIds].sort(), ["a", "b", "c", "e", "f"], "der Bereich beginnt bei der zuletzt umgeschalteten Karte");
});

test("a range without an anchor or for an unloaded card toggles only that card", () => {
  assert.deepEqual([...run(toggle("c", true)).checkedIds], ["c"]);
  const unknown = run(toggle("a"), toggle("x", true));
  assert.deepEqual([...unknown.checkedIds].sort(), ["a", "x"]);
  assert.equal(unknown.anchor, null);
});

test("all hits count the whole search and check every row until a single card is toggled", () => {
  const all = run({ type: "start" }, { type: "all-hits" });
  assert.equal(selectionCount(all, 120), 120);
  assert.equal(isCardChecked(all, "unbekannt"), true);
  const narrowed = reduceCardSelection(all, toggle("b"));
  assert.equal(narrowed.allHits, false);
  assert.equal(selectionCount(narrowed, 120), 1);
  assert.equal(isCardChecked(narrowed, "a"), false);
});

test("a new scope empties the selection, the same scope keeps it", () => {
  const selected = run(toggle("a"), { type: "all-hits" }, { type: "key-action", cardId: "a", request: { id: "delete", nonce: 1 } });
  assert.equal(reduceCardSelection(selected, { type: "scope", scope: "suche" }), selected);
  assert.deepEqual(reduceCardSelection(selected, { type: "scope", scope: "andere Suche" }), emptyCardSelection("andere Suche"));
});

test("clear ends the selection with its pending key action", () => {
  const cleared = run(toggle("a"), { type: "key-action", cardId: "a", request: { id: "flag", flag: 2, nonce: 1 } }, { type: "clear" });
  assert.deepEqual(cleared, emptyCardSelection("suche"));
  const empty = emptyCardSelection("suche");
  assert.equal(reduceCardSelection(empty, { type: "clear" }), empty, "ohne Auswahl ändert sich nichts");
});

test("a key action selects its row only when nothing is selected", () => {
  const request = { id: "suspend" as const, nonce: 7 };
  const alone = run({ type: "key-action", cardId: "c", request });
  assert.deepEqual([...alone.checkedIds], ["c"]);
  assert.equal(alone.selecting, true);
  assert.deepEqual(alone.request, request);
  const kept = run(toggle("a"), toggle("b"), { type: "key-action", cardId: "c", request });
  assert.deepEqual([...kept.checkedIds], ["a", "b"], "eine bestehende Auswahl bleibt das Ziel");
  assert.equal(run({ type: "all-hits" }, { type: "start" }, { type: "key-action", cardId: "c", request }).allHits, true);
});

test("loaded ids replace the selection; none end it", () => {
  const selected = run(toggle("a"), { type: "all-hits" }, { type: "select", ids: ["e", "f"] });
  assert.deepEqual([...selected.checkedIds], ["e", "f"]);
  assert.equal(selected.allHits, false);
  assert.equal(selected.anchor, null);
  assert.equal(run(toggle("a"), { type: "select", ids: [] }).selecting, false);
});

test("selected ids resolve all hits through the injected list only", async () => {
  const listed: string[] = [];
  const listHitIds = async () => { listed.push("abgefragt"); return ["a", "b", "z"]; };
  assert.deepEqual(await selectedCardIds(run(toggle("b"), toggle("a")), listHitIds), ["b", "a"]);
  assert.deepEqual(listed, [], "einzelne Karten brauchen keine Trefferliste");
  assert.deepEqual(await selectedCardIds(run({ type: "all-hits" }), listHitIds), ["a", "b", "z"]);
  assert.deepEqual(await selectedCardIds(run({ type: "all-hits" }), undefined), []);
});

test("studying the selection keeps the hit order and narrows it to the checked cards", () => {
  const hits = ["f", "a", "c", "b"];
  assert.deepEqual(selectedStudyIds(run(toggle("b"), toggle("f"), toggle("x")), hits), ["f", "b"], "nicht lernbare Karten fallen weg");
  assert.deepEqual(selectedStudyIds(run({ type: "all-hits" }), hits), hits);
});
