import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createViewRoute } from "../appNavigation.ts";
import { getGlobalSchedulerPreferences } from "../deckSettings.ts";
import { GlobalCardSettingsScreen } from "./GlobalCardSettingsScreen.tsx";

function renderSettings() {
  const preferences = getGlobalSchedulerPreferences({});
  return renderToStaticMarkup(
    <GlobalCardSettingsScreen
      timeZone="Europe/Berlin"
      globalSchedulerPreferences={preferences}
      learningProfiles={preferences.learningProfiles}
      onSaveLearningProfiles={() => undefined}
      onSaveSettings={() => null}
      onDraftStateChange={() => undefined}
      onNavigate={() => createViewRoute("lernen")}
      simulationOffsetMinutes={3 * 24 * 60}
      simulationDateLabel="Sonntag, 9. August 2026"
      pomodoroTimer={null}
      onStartPomodoro={() => undefined}
    />,
  );
}

test("global learning settings expose planning, profiles, scheduler, focus tools and deck-settings navigation", () => {
  const html = renderSettings();
  assert.match(html, />Lerneinstellungen</);
  for (const heading of ["Lerntag &amp; Planung", "Tagesrunde &amp; Lernprofile", "Scheduler &amp; CoRe", "Fokuswerkzeuge"]) assert.match(html, new RegExp(`>${heading}<`));
  assert.match(html, /aria-label="Bereiche der Lerneinstellungen"/);
  assert.match(html, /href="#card-settings-planning"/);
  assert.match(html, /href="#learning-settings-daily-profiles"/);
  assert.match(html, /href="#learning-settings-scheduler-core"/);
  assert.match(html, /href="#card-settings-focus"/);
  assert.match(html, />Stapeleinstellungen</);
});

test("global learning settings combine account-wide planning and reusable deck defaults", () => {
  const html = renderSettings();
  assert.match(html, /data-testid="card-settings-day-start-hour"/);
  assert.match(html, /data-testid="card-settings-learn-ahead"/);
  assert.match(html, />Wochenrhythmus</);
  for (const weekday of ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]) assert.match(html, new RegExp(`>${weekday}<`));
  assert.match(html, /data-testid="card-settings-easy-day-monday"/);
  assert.match(html, /Europe\/Berlin/);
  assert.match(html, />Simulator</);
  assert.match(html, />Pomodoro-Timer</);
  assert.match(html, /Als Standardprofil verwenden/);
  assert.match(html, /Neue Karten pro Tag/);
  assert.match(html, /Wiederholungen pro Tag/);
  assert.match(html, /Gewünschte Erinnerungsrate/);
  assert.match(html, /Diese CoRe-Werte gelten als Standard/);
  assert.doesNotMatch(html, /Login-E-Mail|Automatisch synchronisieren|Impressum/);
  assert.doesNotMatch(html, /CoRe-Modus/);
});
