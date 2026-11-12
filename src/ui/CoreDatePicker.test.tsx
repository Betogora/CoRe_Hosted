import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CoreDatePicker, createCoreDatePickerMonth, editDateSegment } from "./CoreDatePicker.tsx";

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

test("date picker renders German day, month and year segments and a calendar trigger instead of a native date input", () => {
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

  assert.match(markup, /role="group" aria-label="Nächste Fälligkeit"/);
  const segments = [...markup.matchAll(/role="spinbutton"[^>]*aria-label="([^"]+)"[^>]*aria-valuemax="(\d+)"[^>]*>([^<]+)</g)].map((match) => match.slice(1).join(" "));
  assert.deepEqual(segments, ["Tag 31 20", "Monat 12 08", "Jahr 9999 2026"]);
  assert.equal(markup.match(/core-date-segment-literal">\.</g)?.length, 2);
  assert.match(markup, /<button type="button" aria-label="Nächste Fälligkeit: Kalender öffnen" data-core-date-picker="trigger"[^>]*aria-haspopup="dialog"/);
  assert.doesNotMatch(markup, /type="date"|data-invalid/);
});

test("an empty date picker shows German placeholders", () => {
  const markup = renderToStaticMarkup(<CoreDatePicker value="" today="2026-08-19" ariaLabel="Tag" onValueChange={() => undefined} />);
  assert.deepEqual([...markup.matchAll(/data-placeholder="true" class="core-date-segment">([^<]+)</g)].map((match) => match[1]), ["TT", "MM", "JJJJ"]);
  assert.equal(markup.match(/aria-valuetext="Leer"/g)?.length, 3);
});

const draft = { day: "20", month: "08", year: "2026" };
const anchor = { day: "19", month: "08", year: "2026" };

test("date segments step with arrows, wrap day and month and keep the year in range", () => {
  assert.deepEqual(editDateSegment(draft, "day", "ArrowUp", null, anchor), { draft: { ...draft, day: "21" }, typed: null, advance: false });
  assert.equal(editDateSegment({ ...draft, day: "31" }, "day", "ArrowUp", null, anchor)?.draft.day, "01");
  assert.equal(editDateSegment({ ...draft, month: "02", day: "01" }, "day", "ArrowDown", null, anchor)?.draft.day, "28");
  assert.equal(editDateSegment({ ...draft, month: "12" }, "month", "ArrowUp", null, anchor)?.draft.month, "01");
  assert.equal(editDateSegment({ ...draft, month: "01" }, "month", "ArrowDown", null, anchor)?.draft.month, "12");
  assert.equal(editDateSegment({ ...draft, year: "9999" }, "year", "ArrowUp", null, anchor)?.draft.year, "9999");
  assert.equal(editDateSegment({ ...draft, day: "" }, "day", "ArrowDown", null, anchor)?.draft.day, "19");
  assert.equal(editDateSegment(draft, "day", "Tab", null, anchor), null);
});

test("typed date digits fill a segment and move on once it is full or no digit fits", () => {
  const first = editDateSegment(draft, "day", "3", null, anchor);
  assert.deepEqual(first, { draft: { ...draft, day: "3" }, typed: "3", advance: false });
  assert.deepEqual(editDateSegment(first!.draft, "day", "1", first!.typed, anchor), { draft: { ...draft, day: "31" }, typed: null, advance: true });
  assert.deepEqual(editDateSegment(draft, "day", "4", null, anchor), { draft: { ...draft, day: "04" }, typed: null, advance: true });
  assert.deepEqual(editDateSegment({ ...draft, month: "02" }, "day", "3", null, anchor)?.draft.day, "03");
  assert.deepEqual(editDateSegment(draft, "month", "2", null, anchor), { draft: { ...draft, month: "02" }, typed: null, advance: true });
  assert.deepEqual(editDateSegment(draft, "month", "1", null, anchor), { draft: { ...draft, month: "1" }, typed: "1", advance: false });
  let year = editDateSegment(draft, "year", "2", null, anchor)!;
  for (const digit of ["0", "2"]) year = editDateSegment(year.draft, "year", digit, year.typed, anchor)!;
  assert.deepEqual(year, { draft: { ...draft, year: "202" }, typed: "202", advance: false });
  assert.deepEqual(editDateSegment(year.draft, "year", "7", year.typed, anchor), { draft: { ...draft, year: "2027" }, typed: null, advance: true });
});

test("Backspace empties a date segment digit by digit", () => {
  const once = editDateSegment(draft, "year", "Backspace", null, anchor);
  assert.deepEqual(once, { draft: { ...draft, year: "202" }, typed: "202", advance: false });
  assert.equal(editDateSegment({ ...draft, day: "05" }, "day", "Backspace", null, anchor)?.draft.day, "");
});
