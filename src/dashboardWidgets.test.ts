import assert from "node:assert/strict";
import test from "node:test";
import { createAccountStorage } from "./accountStorage.ts";
import { DASHBOARD_WIDGETS, moveDashboardWidget, normalizeDashboardPreferences, readDashboardPreferences, writeDashboardPreferences } from "./dashboardWidgets.ts";

test("dashboard defaults include all six modules; an intentionally empty layout stays empty", () => {
  assert.deepEqual(normalizeDashboardPreferences(null).widgets.map((widget) => widget.id), DASHBOARD_WIDGETS.map((widget) => widget.id));
  assert.deepEqual(normalizeDashboardPreferences({ widgets: [] }).widgets, []);
});

test("stored layout validates identifiers, widths and own tasks without restoring removed widgets", () => {
  assert.deepEqual(normalizeDashboardPreferences({ widgets: [{ id: "timer", width: "invalid" }, { id: "timer" }, { id: "foreign" }, null], todos: [{ id: "1", text: "  Lesen  ", done: true }, { id: "1", text: "Duplicate" }, { id: "2", text: " " }, { id: "3", text: "Lernen", done: "yes" }] }), {
    widgets: [{ id: "timer", width: "small" }], todos: [{ id: "1", text: "Lesen", done: true }, { id: "3", text: "Lernen", done: false }],
  });
});

test("moving widgets preserves sizing and does not mutate the stored order", () => {
  const widgets = normalizeDashboardPreferences(null).widgets;
  const moved = moveDashboardWidget(widgets, "timer", "heatmap");
  assert.deepEqual(moved.map((widget) => widget.id), ["learning", "motivation", "decks", "todos", "heatmap", "timer"]);
  assert.equal(widgets[2].id, "timer");
  assert.equal(moved[5].width, "small");
  assert.equal(moveDashboardWidget(widgets, "timer", "timer"), widgets);
});

test("local dashboard preferences remain isolated between accounts", (context) => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  context.after(() => { if (previous) Object.defineProperty(globalThis, "localStorage", previous); else Reflect.deleteProperty(globalThis, "localStorage"); });
  const first = normalizeDashboardPreferences({ widgets: [{ id: "timer", width: "wide" }], todos: [{ id: "one", text: "Eigene Aufgabe", done: false }] });
  assert.equal(writeDashboardPreferences("dashboard-test-a", first), true);
  assert.deepEqual(readDashboardPreferences("dashboard-test-a"), first);
  assert.equal(readDashboardPreferences("dashboard-test-b").todos.length, 0);
  const storage = createAccountStorage("dashboard-test-b");
  storage.setItem("core.dashboard.widgets.v1", JSON.stringify({ widgets: [{ id: "timer", width: "full" }], todos: [] }));
  const migrated = readDashboardPreferences("dashboard-test-b");
  assert.deepEqual(migrated.widgets, [{ id: "timer", width: "full" }, { id: "motivation", width: "small" }]);
  assert.deepEqual(readDashboardPreferences("dashboard-test-b"), migrated);
  writeDashboardPreferences("dashboard-test-b", { ...migrated, widgets: [] });
  assert.deepEqual(readDashboardPreferences("dashboard-test-b").widgets, []);
  storage.setItem("core.dashboard.widgets.v1", JSON.stringify({ widgets: [], todos: [] }));
  assert.deepEqual(readDashboardPreferences("dashboard-test-b").widgets, [{ id: "motivation", width: "small" }]);
  assert.deepEqual(readDashboardPreferences("dashboard-test-a"), first);
});
