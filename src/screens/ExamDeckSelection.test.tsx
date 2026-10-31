import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck } from "../coreModel.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { ExamDeckSelection } from "./ExamDeckSelection.tsx";

test("geschlossene Teilbäume verlieren ihre ausgewählten Unterstapel nicht", () => {
  const decks = [createCoreDeck({ id: "root", name: "Medizin" }), createCoreDeck({ id: "child", name: "Anatomie", parentDeckId: "root" })];
  const rows = createDeckLibraryModel(decks, { now: "2026-10-28T12:00:00Z" }).rows;
  const html = renderToStaticMarkup(<ExamDeckSelection rows={rows} selected={new Set(["root", "child"])} onToggle={() => undefined} />);
  assert.match(html, /Medizin: Unterstapel ausklappen/);
  assert.doesNotMatch(html, /aria-label="Anatomie"/);
  assert.match(html, /type="checkbox"[^>]*checked=""/);
});
