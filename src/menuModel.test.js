import assert from "node:assert/strict";
import test from "node:test";
import { createMenuModel } from "./menuModel.js";

test("lists the navigation items in menu order", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.listNavigationItems(), [
    { id: "dashboard", label: "Dashboard", iconKey: "home" },
    { id: "planung", label: "Planung", iconKey: "calendar" },
    { id: "analyse", label: "Analyse", iconKey: "chart" },
  ]);
});

test("uses dashboard as the default view", () => {
  const menu = createMenuModel();

  assert.equal(menu.defaultViewId, "dashboard");
});

test("returns planning content by id", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.getView("planung"), {
    id: "planung",
    label: "Planung",
    iconKey: "calendar",
    title: "Planung",
    eyebrow: "Naechste Schritte",
    body: "Diese Ansicht ist fuer Termine, Ideen und To-dos gedacht. Du kannst sie spaeter mit echten Daten verbinden.",
    stats: [
      { label: "Meetings", value: "3" },
      { label: "Offen", value: "7" },
      { label: "Prioritaet", value: "Hoch" },
    ],
  });
});

test("falls back to the default view for unknown ids", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.getView("does-not-exist"), menu.getView(menu.defaultViewId));
});

test("keeps stats as label and value pairs", () => {
  const menu = createMenuModel();

  assert.deepStrictEqual(menu.getView("dashboard").stats, [
    { label: "Aufgaben", value: "12" },
    { label: "Fokuszeit", value: "4h" },
    { label: "Status", value: "Aktiv" },
  ]);
});
