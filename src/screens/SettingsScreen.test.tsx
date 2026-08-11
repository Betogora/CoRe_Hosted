import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createViewRoute } from "../appNavigation.ts";
import { createCoreRepository } from "../coreRepository.ts";
import { getGlobalDeckSettings } from "../deckSettings.ts";
import { SettingsScreen } from "./SettingsScreen.tsx";

function renderSettings() {
  const state = createCoreRepository(null, { seedDefaultDecks: false }).getState();
  const profile = {
    ...state.profile,
    email: "login@example.test",
    displayName: "Ada",
    university: "TU Berlin",
    preferredLanguage: "de",
  };

  return renderToStaticMarkup(
    <SettingsScreen
      appState={{ ...state, profile }}
      profile={profile}
      syncStatus={{ status: "idle" }}
      globalDeckSettings={getGlobalDeckSettings(profile)}
      onSaveProfile={() => undefined}
      onSaveGlobalLearningSettings={() => undefined}
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

test("settings expose task-based sections and a read-only login email", () => {
  const html = renderSettings();

  for (const heading of ["App und Bedienung", "Account", "Lernen", "Daten und Sync", "Erweitert"]) {
    assert.match(html, new RegExp(`>${heading}<`));
  }
  assert.match(html, /Login-E-Mail/);
  assert.match(html, /readOnly=""[^>]*value="login@example\.test"/);
  assert.match(html, /Eine Änderung der Login-E-Mail wird derzeit nicht in CoRe angeboten\./);
});

test("settings group simulator, Pomodoro timer and help without a duplicate theme control", () => {
  const html = renderSettings();

  assert.doesNotMatch(html, />Darstellung<|Dark Mode für diesen Browser/);
  assert.match(html, />Simulator</);
  assert.match(html, /Aktiv: Sonntag, 9\. August 2026 · \+3 Tage/);
  assert.match(html, /Pomodoro-Timer/);
  assert.match(html, /aria-expanded="false"/);
  assert.ok(html.indexOf("Simulator") < html.indexOf("Pomodoro-Timer"));
  assert.ok(html.indexOf("Pomodoro-Timer") < html.indexOf("Hilfe"));
  assert.match(html, />Hilfe</);
  assert.match(html, /Wie CoRe und FSRS funktionieren/);
});

test("settings replace ineffective privacy controls with truthful information", () => {
  const html = renderSettings();

  assert.doesNotMatch(html, />Lernstand teilen</);
  assert.doesNotMatch(html, />Online-Status zeigen</);
  assert.doesNotMatch(html, />Streaks für andere</);
  assert.match(html, /Lernstand, dein Online-Status und deine Streaks werden derzeit nicht mit anderen Nutzern geteilt\./);
});

test("settings disclose export limits and keep raw JSON in advanced", () => {
  const html = renderSettings();

  assert.match(html, /Medienbytes/);
  assert.match(html, /Authdaten/);
  assert.match(html, /serverseitige Sicherungskopien/);
  assert.match(html, /vollständiges DSGVO-Auskunftspaket nach Art\. 15/);
  assert.match(html, />Export herunterladen</);
  assert.match(html, />Roh-JSON anzeigen</);
});

test("learning settings explain Good and Easy learning-step behavior and hide legacy graduation controls", () => {
  const html = renderSettings();

  assert.match(html, /Globale Lernvorgaben/);
  assert.match(html, /Je Stapel noch änderbar\./);
  assert.doesNotMatch(html, /Diese Werte werden auf alle vorhandenen Stapel angewendet/);
  assert.doesNotMatch(html, /Lernoptionen speichern/);
  assert.match(html, /lucide-scale/);
  assert.match(html, /mit „Gut“ geht es zum nächsten Schritt/);
  assert.match(html, /„Leicht“ beendet die Lernphase sofort/);
  assert.match(html, /Lernkarten vorziehen/);
  assert.match(html, /Neuer Tag beginnt um/);
  assert.match(html, /type="number" min="0" max="23" step="1"[^>]*data-testid="learning-settings-day-start-hour"/);
  assert.match(html, /<\/span><span>Stunden nach Mitternacht<\/span>/);
  assert.doesNotMatch(html, /Varianten einsetzen ab Lernstufe|Aktive Varianten pro Karte/);
  assert.match(html, /Standard · 5 Min. → 15 Min./);
  assert.doesNotMatch(html, /Erstes reguläres Intervall/);
  assert.doesNotMatch(html, /Erstes Leicht-Intervall/);
});
