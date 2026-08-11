import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createViewRoute } from "../appNavigation.ts";
import { createCoreRepository } from "../coreRepository.ts";
import { getGlobalSchedulerPreferences } from "../deckSettings.ts";
import { SettingsScreen } from "./SettingsScreen.tsx";

function renderSettings() {
  const state = createCoreRepository(null, { seedDefaultDecks: false }).getState();
  const profile = { ...state.profile, email: "login@example.test", displayName: "Ada", university: "TU Berlin", fieldOfStudy: "Medizin", preferredLanguage: "en", timezone: "Europe/Berlin" };
  return renderToStaticMarkup(
    <SettingsScreen
      appState={{ ...state, profile }}
      profile={profile}
      syncStatus={{ status: "idle" }}
      globalSchedulerPreferences={getGlobalSchedulerPreferences(profile)}
      onSaveProfile={() => undefined}
      onSaveGlobalSchedulerPreferences={() => undefined}
      onSaveState={() => undefined}
      onSyncNow={async () => undefined}
      onListConflicts={async () => []}
      onResolveConflict={async () => undefined}
      onSignOut={async () => undefined}
      onNavigate={() => createViewRoute("uebersicht")}
      simulationOffsetMinutes={3 * 24 * 60}
      simulationDateLabel="Sonntag, 9. August 2026"
      pomodoroTimer={null}
      onStartPomodoro={() => undefined}
    />,
  );
}

test("global settings expose three task-based sections and cross-navigation", () => {
  const html = renderSettings();
  for (const heading of ["Konto &amp; Datenschutz", "Lerntag &amp; Fokus", "Daten &amp; Synchronisierung"]) assert.match(html, new RegExp(`>${heading}<`));
  assert.match(html, /aria-label="Bereiche der globalen Einstellungen"/);
  assert.match(html, /md:grid-cols-3/);
  assert.match(html, />Stapeleinstellungen</);
});

test("account settings expose persisted profile fields and truthful language", () => {
  const html = renderSettings();
  assert.match(html, /Login-E-Mail/);
  assert.match(html, /readOnly=""[^>]*value="login@example\.test"/);
  assert.match(html, />Fachgebiet</);
  assert.match(html, /value="Medizin"/);
  assert.match(html, /Deutsch \(Beta\)/);
  assert.doesNotMatch(html, /English/);
  assert.match(html, /Lernstand, dein Online-Status und deine Streaks werden derzeit nicht mit anderen Nutzern geteilt/);
});

test("learning-day settings contain only global scheduler context", () => {
  const html = renderSettings();
  assert.match(html, /data-testid="settings-day-start-hour"/);
  assert.match(html, /data-testid="settings-learn-ahead"/);
  assert.match(html, /Europe\/Berlin/);
  assert.match(html, />Simulator</);
  assert.match(html, />Pomodoro-Timer</);
  assert.match(html, />Hilfe</);
  assert.doesNotMatch(html, /Neue Karten pro Tag|Wiederholungen pro Tag|CoRe-Modus|Gewünschte Erinnerungsrate/);
});

test("data settings disclose export limits and profile portability", () => {
  const html = renderSettings();
  for (const text of ["Medienbytes", "Authdaten", "serverseitigen Sicherungskopien", "DSGVO-Auskunftsdaten nach Art. 15", "Eigene Lernprofile"]) assert.match(html, new RegExp(text));
  assert.match(html, />Export herunterladen</);
  assert.match(html, />Roh-JSON anzeigen</);
});
