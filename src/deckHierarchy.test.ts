import assert from "node:assert/strict";
import test from "node:test";
import { createCoreDeck } from "./coreModel.ts";
import { getImportedDeckHierarchyOverflow, projectImportedDeckHierarchy } from "./deckHierarchy.ts";

test("imported deck hierarchy preserves paths through level eight", () => {
  for (const length of [1, 8]) {
    const sourcePath = Array.from({ length }, (_, index) => String.fromCharCode(65 + index));
    const projection = projectImportedDeckHierarchy(sourcePath);
    assert.deepEqual(projection.visiblePath, sourcePath);
    assert.equal(projection.wasFlattened, false);
    assert.deepEqual(projection.overflowPath, []);
  }
});

test("imported deck hierarchy flattens level nine and deeper below level seven", () => {
  const paths = ["H", "I", "J"].map((_, index) => projectImportedDeckHierarchy(
    ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].slice(0, 8 + index),
  ));

  assert.deepEqual(paths.map((projection) => projection.visiblePath), [
    ["A", "B", "C", "D", "E", "F", "G", "H"],
    ["A", "B", "C", "D", "E", "F", "G", "I"],
    ["A", "B", "C", "D", "E", "F", "G", "J"],
  ]);
  assert.deepEqual(paths.map((projection) => projection.visibleParentSourcePath), [
    "A::B::C::D::E::F::G",
    "A::B::C::D::E::F::G",
    "A::B::C::D::E::F::G",
  ]);
  assert.deepEqual(paths.map((projection) => projection.overflowPath), [[], ["H", "I"], ["H", "I", "J"]]);
  assert.deepEqual(paths.map((projection) => projection.wasFlattened), [false, true, true]);
});

test("imported deck hierarchy overflow is derived from existing APKG metadata", () => {
  const deck = createCoreDeck({
    name: "J",
    source: "anki-apkg",
    hierarchyPath: ["A", "B", "C", "D", "E", "F", "G", "J"],
    importMeta: { sourceMetadata: { ankiDeckPath: "A::B::C::D::E::F::G::H::I::J" } },
    cards: [],
  });

  assert.deepEqual(getImportedDeckHierarchyOverflow(deck)?.overflowPath, ["H", "I", "J"]);
  assert.equal(getImportedDeckHierarchyOverflow(createCoreDeck({ name: "Manuell", source: "manual", cards: [] })), null);
});
