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

test("global card settings expose planning, focus tools and deck-settings navigation", () => {
  const html = renderSettings();
  assert.match(html, />Karteneinstellungen</);
  for (const heading of ["Lerntag &amp; Planung", "Fokuswerkzeuge"]) assert.match(html, new RegExp(`>${heading}<`));
  assert.match(html, /aria-label="Bereiche der Karteneinstellungen"/);
  assert.match(html, /href="#card-settings-planning"/);
  assert.match(html, /href="#card-settings-focus"/);
  assert.match(html, />Stapeleinstellungen</);
});

test("global card settings contain only account-wide learning controls", () => {
  const html = renderSettings();
  assert.match(html, /data-testid="card-settings-day-start-hour"/);
  assert.match(html, /data-testid="card-settings-learn-ahead"/);
  assert.match(html, />Wochenrhythmus</);
  for (const weekday of ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]) assert.match(html, new RegExp(`>${weekday}<`));
  assert.match(html, /data-testid="card-settings-easy-day-monday"/);
  assert.match(html, /Europe\/Berlin/);
  assert.match(html, />Simulator</);
  assert.match(html, />Pomodoro-Timer</);
  assert.match(html, /gelten global für alle Karten und Stapel/);
  assert.doesNotMatch(html, /Login-E-Mail|Automatisch synchronisieren|Impressum/);
  assert.doesNotMatch(html, /Neue Karten pro Tag|Wiederholungen pro Tag|CoRe-Modus|Gewünschte Erinnerungsrate/);
});
