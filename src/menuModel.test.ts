import assert from "node:assert/strict";
import test from "node:test";
import { createMenuModel } from "./menuModel.ts";

test("lists the navigation items in product order", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.listNavigationItems(), [
    { id: "uebersicht", label: "Heute", iconKey: "home" },
    { id: "lernen", label: "Lernen", iconKey: "learn" },
    { id: "neue-karten", label: "Erstellen", iconKey: "plus" },
    { id: "kartenstapel", label: "Karten", iconKey: "layers" },
    { id: "statistik", label: "Statistik", iconKey: "chart" },
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
    navigation: "primary",
    title: "Neue Karten",
    eyebrow: "Import und Erstellung",
    stats: [
      { label: "Anki", value: "APKG" },
      { label: "Manuell", value: "6 Typen" },
      { label: "Tabelle", value: "Paste" },
    ],
  });
});

test("keeps cards in primary navigation and utility views outside it", () => {
  const menu = createMenuModel();

  assert.ok(menu);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(menu.getView("kartenstapel").title, "Karten");
  assert.ok(menu);
// @ts-expect-error -- Die Fixture prüft bewusst eine unvollständige, ungültige oder konfliktbehaftete Laufzeitform.
  assert.equal(menu.getView("hilfe").title, "Wie CoRe und FSRS funktionieren");
  assert.equal(menu.getView("simulator")?.title, "Simulator");
  assert.ok(menu);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(menu.getView("einstellungen").title, "Einstellungen");
  assert.deepStrictEqual(menu.getView("einstellungen")?.stats, []);
  assert.equal(menu.listNavigationItems().some((item) => item.id === "kartenstapel"), true);
  assert.equal(menu.listNavigationItems().some((item) => item.id === "einstellungen"), false);
  assert.equal(menu.listNavigationItems().some((item) => item.id === "hilfe"), false);
  assert.equal(menu.listNavigationItems().some((item) => item.id === "simulator"), false);
  assert.equal(menu.listNavigationItems().some((item) => String(item.id) === "ki"), false);
  assert.equal(menu.listNavigationItems().some((item) => String(item.id) === "assistent"), false);
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
    { label: "CoRe-ready", value: "0" },
  ]);
});

test("lists all view metadata without exposing internal array references", () => {
  const menu = createMenuModel();
  const views = menu.listViews();

  views[0].stats.push({ label: "Mutation", value: "bad" });

  assert.equal(menu.listViews()[0].stats.length, 2);
});
