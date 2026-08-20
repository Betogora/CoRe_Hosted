import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CoreDatePicker, createCoreDatePickerMonth } from "./CoreDatePicker.tsx";

test("date picker month uses a stable Monday-first six-week calendar", () => {
  const days = createCoreDatePickerMonth("2026-08-01", {
    value: "2026-08-20",
    today: "2026-08-19",
    min: "2026-08-10",
    max: "2026-09-05",
  });

  assert.equal(days.length, 42);
  assert.equal(days[0].key, "2026-07-27");
  assert.equal(days.at(-1)?.key, "2026-09-06");
  assert.equal(days.find((day) => day.key === "2026-08-20")?.selected, true);
  assert.equal(days.find((day) => day.key === "2026-08-19")?.today, true);
  assert.equal(days.find((day) => day.key === "2026-08-09")?.disabled, true);
  assert.equal(days.find((day) => day.key === "2026-09-05")?.disabled, false);
  assert.equal(days.find((day) => day.key === "2026-09-06")?.disabled, true);
});

test("date picker month includes leap days and marks adjacent months", () => {
  const days = createCoreDatePickerMonth("2028-02-01", { value: "2028-02-29", today: "2028-02-01" });

  assert.equal(days.find((day) => day.key === "2028-02-29")?.selected, true);
  assert.equal(days.find((day) => day.key === "2028-01-31")?.outsideMonth, true);
  assert.equal(days.find((day) => day.key === "2028-03-01")?.outsideMonth, true);
});

test("date picker renders a German CoRe trigger instead of a native date input", () => {
  const markup = renderToStaticMarkup(
    <CoreDatePicker
      value="2026-08-20"
      min="2026-08-19"
      max="2026-08-31"
      today="2026-08-19"
      ariaLabel="Nächste Fälligkeit"
      onValueChange={() => undefined}
    />,
  );

  assert.match(markup, /aria-label="Nächste Fälligkeit"/);
  assert.match(markup, /data-core-date-picker="trigger"/);
  assert.match(markup, />20\.08\.2026</);
  assert.doesNotMatch(markup, /type="date"/);
});
