import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPomodoroTimer, pausePomodoroTimer } from "../pomodoroTimer.ts";
import { POMODORO_PRESET_MINUTES, PomodoroPill, PomodoroTimerControl, StudyTimerTile } from "./pomodoroTimerUi.tsx";

const noop = () => undefined;

test("PomodoroTimerControl exposes the collapsed global and study entry points as Lerntimer", () => {
  for (const variant of ["settings", "study"] as const) {
    const markup = renderToStaticMarkup(<PomodoroTimerControl timer={null} variant={variant} onStart={noop} />);
    assert.match(markup, />Lerntimer</);
    assert.doesNotMatch(markup, /Pomodoro/);
    assert.match(markup, /aria-expanded="false"/);
    assert.match(markup, /aria-controls=/);
    assert.match(markup, /25 Min\./);
    if (variant === "settings") assert.match(markup, /class="core-settings-row-title">Lerntimer<\/span><\/span>/, "ohne laufenden Timer steht kein Zustand am Titel");
  }
  assert.deepEqual(POMODORO_PRESET_MINUTES, [10, 25, 50]);
});

test("the settings row marks a running timer with its remaining time and keeps the duration as its value", () => {
  const timer = createPomodoroTimer(25, Date.now() - 5 * 60_000, "pomodoro_running");
  assert.ok(timer);
  const markup = renderToStaticMarkup(<PomodoroTimerControl timer={timer} variant="settings" onStart={noop} />);
  assert.match(markup, /<span class="core-tag core-tag-info">Läuft · 20 Min\.<\/span>/);
  assert.match(markup, />25 Min\.<svg/);
});

test("the ready tile offers start, the three durations and the pencil, with the minutes as the editable field", () => {
  const markup = renderToStaticMarkup(<StudyTimerTile timer={null} onStart={noop} onPause={noop} onResume={noop} onReset={noop} />);
  assert.match(markup, /class="core-study-timer-tile" style="--core-study-timer:#b95e00;--core-study-timer-on:#ffffff" data-state="ready"/);
  assert.match(markup, /<h2 class="core-study-timer-label">Lerntimer<\/h2>/);
  assert.match(markup, /aria-label="Minuten"[^>]*role="spinbutton"[^>]*value="25"/);
  assert.match(markup, /:00<\/span>/);
  assert.match(markup, /aria-label="Lerntimer starten"/);
  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(markup, /aria-label="25 Minuten" aria-pressed="true"/);
  assert.match(markup, /aria-label="10 Minuten" aria-pressed="false"[\s\S]*aria-label="50 Minuten" aria-pressed="false"[\s\S]*aria-label="Dauer eintippen"/);
  assert.doesNotMatch(markup, /Bereit|Endet um|Lerntimer pausieren|zurücksetzen/);
});

test("a running tile shows the remaining mm:ss, the elapsed level, pause and a disabled reset", () => {
  const timer = createPomodoroTimer(25, Date.now() - 5 * 60_000, "pomodoro_tile");
  assert.ok(timer);
  const markup = renderToStaticMarkup(<StudyTimerTile timer={timer} onStart={noop} onPause={noop} onResume={noop} onReset={noop} />);
  assert.match(markup, /data-state="running"/);
  assert.match(markup, /class="core-study-timer-level" style="height:(19\.9|20)[\d.]*%"/);
  assert.match(markup, /<span>(20|19)<\/span><span class="core-study-timer-seconds">:\d\d<\/span>/);
  assert.match(markup, /aria-label="Lerntimer pausieren"/);
  assert.match(markup, /aria-label="Lerntimer zurücksetzen" disabled=""/);
  assert.doesNotMatch(markup, /spinbutton|Dauer wählen/);

  const paused = renderToStaticMarkup(<StudyTimerTile timer={pausePomodoroTimer(timer)} onStart={noop} onPause={noop} onResume={noop} onReset={noop} />);
  assert.match(paused, /data-state="paused"/);
  assert.match(paused, /aria-label="Lerntimer fortsetzen"/);
  assert.doesNotMatch(paused, /aria-label="Lerntimer zurücksetzen"[^>]*disabled/);
});

test("the timer text follows the contrast of the Lerntimer color like the heatmap", () => {
  const storage = new Map([["core.studyTimer.color.v1", "#fde68a"]]);
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key: string) => storage.get(key) ?? null } } as unknown as Window & typeof globalThis;
  try {
    const markup = renderToStaticMarkup(<StudyTimerTile timer={null} onStart={noop} onPause={noop} onResume={noop} onReset={noop} />);
    assert.match(markup, /--core-study-timer:#fde68a;--core-study-timer-on:#111827/);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("PomodoroPill hides without an active timer and pauses or resumes the remaining one", () => {
  const expiredTimer = createPomodoroTimer(25, Date.now() - 26 * 60_000, "pomodoro_expired");
  assert.ok(expiredTimer);
  for (const timer of [null, expiredTimer]) assert.equal(renderToStaticMarkup(<PomodoroPill timer={timer} onPauseChange={noop} />), "");

  const timer = createPomodoroTimer(25, Date.now() - 1_000, "pomodoro_render");
  assert.ok(timer);
  const markup = renderToStaticMarkup(<PomodoroPill timer={timer} onPauseChange={noop} />);
  assert.match(markup, /aria-label="Lerntimer pausieren, noch 25 Min\."/);
  assert.match(markup, /--core-study-timer-elapsed:0\.\d+%/);
  assert.match(markup, />24:5\d<\/span>/);

  const paused = renderToStaticMarkup(<PomodoroPill timer={pausePomodoroTimer(timer)} onPauseChange={noop} />);
  assert.match(paused, /data-paused="true"[^>]*aria-label="Lerntimer fortsetzen, noch 25 Min\."/);
});
