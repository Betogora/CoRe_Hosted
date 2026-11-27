import assert from "node:assert/strict";
import test from "node:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createViewRoute } from "../appNavigation.ts";
import { getGlobalSchedulerPreferences } from "../deckSettings.ts";
import { GlobalCardSettingsScreen } from "./GlobalCardSettingsScreen.tsx";

type LearningSection = React.ComponentProps<typeof GlobalCardSettingsScreen>["section"];

function renderSettings(section: LearningSection, flagNames: string[] = ["", "", "", "", "", "", ""]) {
  const preferences = getGlobalSchedulerPreferences({});
  return renderToStaticMarkup(
    <GlobalCardSettingsScreen
      section={section}
      decks={[]}
      onOpenDeckSettings={() => undefined}
      timeZone="Europe/Berlin"
      globalSchedulerPreferences={preferences}
      flagNames={flagNames}
      learningProfiles={preferences.learningProfiles}
      onSaveLearningProfiles={() => undefined}
      onSaveSettings={() => null}
      onDraftStateChange={() => undefined}
      onNavigate={() => createViewRoute("lernen")}
      simulationOffsetMinutes={3 * 24 * 60}
      pomodoroTimer={null}
      onStartPomodoro={() => undefined}
    />,
  );
}

test("learning settings render exactly the requested dialog area without a page shell", () => {
  const headings = { lerntag: "Lerntag &amp; Planung", flaggen: "Flaggen", fokus: "Fokuswerkzeuge", stapel: "Einzelne Stapel", tagesrunde: "Tagesrunde &amp; Lernprofile", scheduler: "Scheduler &amp; CoRe" } as const;
  for (const [section, heading] of Object.entries(headings) as Array<[LearningSection, string]>) {
    const html = renderSettings(section);
    assert.equal(html.match(/<h2 /g)?.length, 1);
    assert.match(html, new RegExp(`<h2[^>]*tabindex="-1"[^>]*>${heading}</h2>`));
    assert.doesNotMatch(html, />Lerneinstellungen</);
  }
  assert.doesNotMatch(renderSettings("tagesrunde"), /Einzelne Stapel|card-settings-open-deck/);
});

test("the deck area is one row that opens the settings of a chosen deck", () => {
  const html = renderSettings("stapel");
  assert.match(html, />Stapeleinstellungen<[\s\S]*?aria-label="Stapeleinstellungen öffnen"[^>]*data-testid="card-settings-open-deck"/);
  assert.equal(html.match(/class="core-settings-row"/g)?.length, 1);
});

test("global learning settings combine account-wide planning and reusable deck defaults", () => {
  const planning = renderSettings("lerntag");
  assert.match(planning, /data-testid="card-settings-day-start-hour"/);
  assert.match(planning, /data-testid="card-settings-learn-ahead"/);
  assert.match(planning, />Wochenrhythmus</);
  assert.match(planning, /Europe\/Berlin/);
  const focus = renderSettings("fokus");
  assert.match(focus, />Simulator</);
  assert.match(focus, />Lerntimer</);
  const daily = renderSettings("tagesrunde");
  assert.match(daily, />Anwenden</);
  assert.match(daily, /<span class="core-tag core-tag-neutral">Standard für neue Stapel<\/span>/);
  assert.match(focus, /data-testid="card-settings-simulation-state"[^>]*>Aktiv · \+/);
  assert.match(daily, /Neue Karten pro Tag/);
  assert.match(daily, /Wiederholungen pro Tag/);
  const scheduler = renderSettings("scheduler");
  assert.match(scheduler, /Gewünschte Erinnerungsrate/);
  assert.match(scheduler, /<span class="core-tag core-tag-neutral">Standard für neue Stapel<\/span>/);
  assert.match(scheduler, /aria-label="Hinweis: Content Repetition"/);
  for (const html of [planning, focus, daily, scheduler]) {
    assert.doesNotMatch(html, /Login-E-Mail|Automatisch synchronisieren|Impressum/);
    assert.doesNotMatch(html, /CoRe-Modus/);
  }
});

test("the Flaggen section names seven flags; an empty field stands for the color name (W23)", () => {
  const flags = renderSettings("flaggen", ["", "", "", "Nachschlagen", "", "", ""]);
  assert.equal([...flags.matchAll(/aria-label="Name für Flagge /g)].length, 7);
  assert.match(flags, /placeholder="Rot" aria-label="Name für Flagge Rot"/);
  assert.match(flags, /placeholder="Blau"[^>]*value="Nachschlagen"/);
  assert.match(flags, /var\(--core-flag-7\)/);
  assert.equal(flags.match(/lucide-flag/g)?.length, 7, "jede Zeile zeigt das Flaggen-Icon");
  assert.doesNotMatch(flags, /core-settings-row-title|core-settings-list/);
});

test("the weekly rhythm is one table with a radio group per weekday", () => {
  const html = renderSettings("lerntag");
  const table = html.slice(html.indexOf('<table class="core-settings-matrix'), html.indexOf("</table>"));
  assert.match(html, /<div class="core-settings-matrix-frame[^"]*"><table class="core-settings-matrix">/);
  for (const level of ["Normal", "Weniger", "Minimal"]) assert.match(table, new RegExp(`<th scope="col">${level}</th>`));
  assert.equal(table.match(/type="radio"/g)?.length, 21);
  assert.equal(table.match(/<input type="radio"[^>]*name="card-settings-easy-day-monday"/g)?.length, 3);
  assert.match(table, /<th scope="row">Sonntag<\/th>/);
  assert.match(table, /aria-label="Montag: Normal"[^>]*checked="" value="normal"/);
  assert.doesNotMatch(html, /core-surface-raised|bg-core-warning-soft/);
});
