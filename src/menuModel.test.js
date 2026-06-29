import assert from "node:assert/strict";
import test from "node:test";
import { createMenuModel } from "./menuModel.js";

test("lists the navigation items in menu order", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.listNavigationItems(), [
    { id: "uebersicht", label: "Uebersicht", iconKey: "home" },
    { id: "neue-karten", label: "Neue Karten", iconKey: "plus" },
    { id: "lernen", label: "Lernen", iconKey: "learn" },
    { id: "analyse", label: "Decks", iconKey: "chart" },
  ]);
});

test("uses overview as the default view", () => {
  const menu = createMenuModel();

  assert.equal(menu.defaultViewId, "uebersicht");
});

test("returns new-card content by id", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.getView("neue-karten"), {
    id: "neue-karten",
    label: "Neue Karten",
    iconKey: "plus",
    title: "Neue Karten",
    eyebrow: "Erstellen",
    body: "Waehle zuerst zwischen Anki-Import, manueller Erstellung oder KI-assistierter Vorbereitung.",
    stats: [
      { label: "Anki", value: "APKG" },
      { label: "Manuell", value: "6 Typen" },
      { label: "KI", value: "Review-first" },
    ],
  });
});

test("falls back to the default view for unknown ids", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.getView("does-not-exist"), menu.getView(menu.defaultViewId));
});

test("keeps stats as label and value pairs", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.getView("uebersicht").stats, [
    { label: "Importierte Decks", value: "0" },
    { label: "Originalkarten", value: "0" },
    { label: "CoRe-ready", value: "0" },
  ]);
});
