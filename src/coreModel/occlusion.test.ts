import assert from "node:assert/strict";
import test from "node:test";
import {
  addOcclusionMask,
  createNote,
  createOcclusionNoteContent,
  groupOcclusionMasks,
  moveOcclusionMasks,
  occlusionGroups,
  parseNoteContent,
  planNoteContentChange,
  removeOcclusionMasks,
  setOcclusionMasksAlwaysOccluded,
  ungroupOcclusionMasks,
  validateOcclusionInput,
} from "../coreModel.ts";
import type { OcclusionMask } from "../coreTypes.ts";

const rect = (left: number) => ({ kind: "rect" as const, left, top: 0.1, width: 0.2, height: 0.2, angle: 0 });

function threeMasks(): OcclusionMask[] {
  let masks: OcclusionMask[] = [];
  for (const left of [0.1, 0.4, 0.7]) masks = addOcclusionMask(masks, rect(left)).masks;
  return masks;
}

test("new masks become their own groups and stay inside the image", () => {
  const masks = threeMasks();
  assert.deepEqual(masks.map((mask) => [mask.id, mask.ordinal]), [["mask-1", 1], ["mask-2", 2], ["mask-3", 3]]);
  const outside = addOcclusionMask(masks, { kind: "rect", left: 0.95, top: -0.2, width: 0.3, height: 0.1, angle: 0 }).masks.at(-1)!;
  assert.deepEqual(outside.shape, { kind: "rect", left: 0.7, top: 0, width: 0.3, height: 0.1, angle: 0 });
  const moved = moveOcclusionMasks(masks, ["mask-1"], 0.85, 0)[0];
  assert.equal(moved.shape.kind === "rect" && moved.shape.left, 0.8);
});

test("grouping, ungrouping and always occluded masks keep existing group numbers", () => {
  const grouped = groupOcclusionMasks(threeMasks(), ["mask-2", "mask-3"]);
  assert.deepEqual(occlusionGroups(grouped).map((group) => [group.ordinal, group.masks.map((mask) => mask.id)]), [[1, ["mask-1"]], [2, ["mask-2", "mask-3"]]]);
  const ungrouped = ungroupOcclusionMasks(grouped, ["mask-2", "mask-3"]);
  assert.deepEqual(ungrouped.map((mask) => mask.ordinal), [1, 2, 3]);
  const hidden = setOcclusionMasksAlwaysOccluded(ungrouped, ["mask-1"], true);
  assert.deepEqual(hidden[0], { ...hidden[0], ordinal: 0, alwaysOccluded: true });
  assert.equal(setOcclusionMasksAlwaysOccluded(hidden, ["mask-1"], false)[0].ordinal, 4);
  assert.deepEqual(removeOcclusionMasks(ungrouped, ["mask-1"]).map((mask) => mask.ordinal), [2, 3]);
});

test("occlusion content validates and turns groups into cards; removing a group removes only its card", () => {
  const masks = threeMasks();
  assert.deepEqual(validateOcclusionInput({ image: "", masks: [] }), { image: "Bitte ein Bild wählen.", masks: "Bitte mindestens eine Maske zeichnen, die abgefragt wird." });
  const content = createOcclusionNoteContent({ image: "herz.png", mode: "hide-all-guess-one", masks, header: "Herz", tags: ["anatomie"] });
  assert.equal(parseNoteContent(content).ok, true);
  const graph = createNote({ content, deckId: "deck", media: { "herz.png": "a".repeat(40) } });
  assert.deepEqual(graph.cards.map((card) => card.promptKey), ["io:1", "io:2", "io:3"]);
  const plan = planNoteContentChange(graph, { ...content, interaction: { ...content.interaction, masks: removeOcclusionMasks(masks, ["mask-1"]) } as typeof content.interaction }, "2026-10-09T12:00:00.000Z");
  assert.deepEqual(plan.removedCards.map((card) => card.promptKey), ["io:1"]);
  assert.deepEqual(plan.keptCards.map((card) => card.promptKey), ["io:2", "io:3"]);
});
