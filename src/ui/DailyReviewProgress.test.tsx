import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyReviewProgress } from "./DailyReviewProgress.tsx";

const progress = {
  completedTodayCount: 1,
  newCount: 3,
  inProgressCount: 1,
  dueCount: 5,
  total: 10,
};

test("daily progress shares the canonical segment order, colors and accessible summary", () => {
  const markup = renderToStaticMarkup(<DailyReviewProgress progress={progress} />);

  assert.match(markup, /aria-valuenow="1"/);
  assert.match(markup, /aria-valuemax="10"/);
  assert.match(markup, /aria-valuetext="Gelernt: 1 Karte, Neu: 3 Karten, Offen: 1 Karte, Fällig: 5 Karten"/);
  for (const [key, label, color, count, value] of [
    ["learned", "Gelernt", "--core-learning-progress-completed", 1, "1 Karte"],
    ["new", "Neu", "--core-learning-status-new", 3, "3 Karten"],
    ["in-progress", "Offen", "--core-learning-status-in-progress", 1, "1 Karte"],
    ["due", "Fällig", "--core-learning-status-due", 5, "5 Karten"],
  ] as const) {
    assert.match(markup, new RegExp(`data-study-progress-segment="${key}"[^>]*background-color:var\\(${color}\\)[^>]*flex-grow:${count}`));
    assert.match(markup, new RegExp(`data-core-tooltip="${label}"[^>]*data-core-tooltip-swatch="var\\(${color}\\)"[^>]*data-core-tooltip-value="${value}"`));
  }
  assert.ok(markup.indexOf('data-study-progress-segment="learned"') < markup.indexOf('data-study-progress-segment="new"'));
  assert.ok(markup.indexOf('data-study-progress-segment="new"') < markup.indexOf('data-study-progress-segment="in-progress"'));
  assert.ok(markup.indexOf('data-study-progress-segment="in-progress"') < markup.indexOf('data-study-progress-segment="due"'));
});

test("achieved progress renders a full neutral-gray segment, including a zero-card goal", () => {
  const completed = renderToStaticMarkup(<DailyReviewProgress progress={{ ...progress, completedTodayCount: 10, newCount: 0, inProgressCount: 0, dueCount: 0 }} achieved />);
  const empty = renderToStaticMarkup(<DailyReviewProgress progress={{ completedTodayCount: 0, newCount: 0, inProgressCount: 0, dueCount: 0, total: 0 }} achieved />);

  assert.match(completed, /data-study-progress-segment="achieved"[^>]*background-color:var\(--core-learning-progress-completed\)/);
  assert.match(completed, /aria-valuenow="10"/);
  assert.match(completed, /aria-valuetext="Tagesziel erreicht\./);
  assert.match(empty, /aria-valuenow="1"/);
  assert.match(empty, /aria-valuemax="1"/);
  assert.match(empty, /Tagesziel erreicht/);
});
