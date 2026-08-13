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

test("PomodoroProgress renders an idle study bar and hides idle shell projections", () => {
  const study = renderToStaticMarkup(<PomodoroProgress timer={null} variant="study" />);
  assert.match(study, /role="progressbar"/);
  assert.match(study, /aria-valuetext="Nicht gestartet"/);
  assert.match(study, /width:0%/);
  assert.equal(renderToStaticMarkup(<PomodoroProgress timer={null} variant="sidebar" />), "");
  assert.equal(renderToStaticMarkup(<PomodoroProgress timer={null} variant="header" />), "");
});

test("PomodoroProgress labels the running timer in whole minutes", () => {
  const timer = createPomodoroTimer(25, Date.now() - 1_000, "pomodoro_render");
  assert.ok(timer);
  const markup = renderToStaticMarkup(<PomodoroProgress timer={timer} variant="study" />);

  assert.match(markup, /aria-valuetext="Noch 25 Min\."/);
  assert.match(markup, /aria-valuemax="1500"/);
  assert.match(markup, /style="width:9[0-9]/);
});
