import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPomodoroTimer } from "../pomodoroTimer.ts";
import { POMODORO_PRESET_MINUTES, PomodoroProgress, PomodoroTimerControl } from "./pomodoroTimerUi.tsx";

test("PomodoroTimerControl exposes the collapsed global and study entry points", () => {
  for (const variant of ["settings", "study"] as const) {
    const markup = renderToStaticMarkup(<PomodoroTimerControl timer={null} variant={variant} onStart={() => undefined} />);
    assert.match(markup, /Pomodoro-Timer/);
    assert.match(markup, /aria-expanded="false"/);
    assert.match(markup, /aria-controls=/);
    assert.match(markup, /25 Min\./);
    assert.match(markup, /data-pomodoro-icon="tomato"/);
    assert.doesNotMatch(markup, /Noch nicht verfügbar/);
  }
  assert.deepEqual(POMODORO_PRESET_MINUTES, [15, 25, 45]);
});

test("PomodoroProgress hides every projection without a running timer", () => {
  const expiredTimer = createPomodoroTimer(25, Date.now() - 26 * 60_000, "pomodoro_expired");
  assert.ok(expiredTimer);

  for (const timer of [null, expiredTimer]) {
    for (const variant of ["study", "sidebar", "header"] as const) {
      assert.equal(renderToStaticMarkup(<PomodoroProgress timer={timer} variant={variant} />), "");
    }
  }
});

test("PomodoroProgress labels the running timer in whole minutes", () => {
  const timer = createPomodoroTimer(25, Date.now() - 1_000, "pomodoro_render");
  assert.ok(timer);
  const markup = renderToStaticMarkup(<PomodoroProgress timer={timer} variant="study" />);

  assert.match(markup, /aria-valuetext="Noch 25 Min\."/);
  assert.match(markup, /aria-valuemax="1500"/);
  assert.match(markup, /style="width:9[0-9]/);
});

test("PomodoroProgress fits the sidebar and shows only rounded-up remaining minutes", () => {
  const timer = createPomodoroTimer(25, Date.now() - 60_100, "pomodoro_sidebar");
  assert.ok(timer);
  const markup = renderToStaticMarkup(<PomodoroProgress timer={timer} variant="sidebar" />);

  assert.match(markup, /class="grid min-w-0 w-full gap-1\.5" data-pomodoro-progress="sidebar"/);
  assert.match(markup, />24 min\.<\/p>/);
  assert.match(markup, /aria-valuetext="24 min\."/);
  assert.doesNotMatch(markup, />Pomodoro-Timer<|>Noch 24 Min\.</);
});
