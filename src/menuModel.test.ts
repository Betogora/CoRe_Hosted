import assert from "node:assert/strict";
import test from "node:test";
import { createMenuModel } from "./menuModel.ts";

test("lists the navigation items in product order", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.listNavigationItems(), [
    { id: "uebersicht", label: "Heute", iconKey: "home" },
    { id: "neue-karten", label: "Erstellen", iconKey: "plus" },
    { id: "lernen", label: "Lernen", iconKey: "learn" },
    { id: "statistik", label: "Statistik", iconKey: "chart" },
    { id: "graph", label: "Graph", iconKey: "graph" },
    { id: "community", label: "Community", iconKey: "community" },
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
    stats: [
      { label: "Anki", value: "APKG" },
      { label: "Manuell", value: "6 Typen" },
      { label: "KI", value: "Drafts" },
    ],
  });
});

test("keeps deck and settings views available outside the main navigation", () => {
  const menu = createMenuModel();

  assert.ok(menu);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(menu.getView("kartenstapel").title, "Kartenstapel");
  assert.ok(menu);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(menu.getView("einstellungen").title, "Einstellungen");
  assert.equal(menu.listNavigationItems().some((item) => item.id === "kartenstapel"), false);
  assert.equal(menu.listNavigationItems().some((item) => item.id === "einstellungen"), false);
  assert.equal(menu.listNavigationItems().some((item) => item.id === "ki"), false);
  assert.equal(menu.listNavigationItems().some((item) => item.id === "assistent"), false);
});

test("falls back to the default view for unknown ids", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.getView("does-not-exist"), menu.getView(menu.defaultViewId));
});

test("keeps stats as label and value pairs", () => {
  const menu = createMenuModel();

  assert.ok(menu);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.deepStrictEqual(menu.getView("uebersicht").stats, [
    { label: "Fällig", value: "0" },
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
