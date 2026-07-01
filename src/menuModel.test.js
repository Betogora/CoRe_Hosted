import assert from "node:assert/strict";
import test from "node:test";
import { createMenuModel } from "./menuModel.js";

test("lists the navigation items in product order", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.listNavigationItems(), [
    { id: "uebersicht", label: "Heute", iconKey: "home" },
    { id: "kartenstapel", label: "Kartenstapel", iconKey: "layers" },
    { id: "neue-karten", label: "Erstellen", iconKey: "plus" },
    { id: "lernen", label: "Lernen", iconKey: "learn" },
    { id: "graph", label: "Graph", iconKey: "graph" },
    { id: "community", label: "Community", iconKey: "community" },
    { id: "ki", label: "KI-Jobs", iconKey: "bot" },
    { id: "assistent", label: "Assistent", iconKey: "assistant" },
    { id: "einstellungen", label: "Einstellungen", iconKey: "settings" },
  ]);
});

test("uses today as the default view", () => {
  const menu = createMenuModel();

  assert.equal(menu.defaultViewId, "uebersicht");
});

test("returns new-card content by id", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.getView("neue-karten"), {
    id: "neue-karten",
    label: "Erstellen",
    iconKey: "plus",
    title: "Neue Karten",
    eyebrow: "Import und Erstellung",
    body: "APKG, Text/CSV, manuelle Karten mit Dokumentanker und KI-Drafts.",
    stats: [
      { label: "Anki", value: "APKG" },
      { label: "Manuell", value: "6 Typen" },
      { label: "KI", value: "Drafts" },
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
    { label: "Faellig", value: "0" },
    { label: "Originalkarten", value: "0" },
    { label: "CoRe-ready", value: "0" },
  ]);
});

test("lists all view metadata without exposing internal array references", () => {
  const menu = createMenuModel();
  const views = menu.listViews();

  views[0].stats.push({ label: "Mutation", value: "bad" });

  assert.equal(menu.listViews()[0].stats.length, 3);
});
