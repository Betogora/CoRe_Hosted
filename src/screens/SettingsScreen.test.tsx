import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsScreen } from "./SettingsScreen.tsx";

function renderSettings() {
  const profile = {
    email: "login@example.test",
    displayName: "Ada",
    university: "TU Berlin",
    preferredLanguage: "de",
    privacy: {
      shareLearningProgress: true,
      showOnlineStatus: true,
      showStreaksToOthers: true,
    },
  };

  return renderToStaticMarkup(
    <SettingsScreen
      appState={{ profile, decks: [], communities: [], aiJobs: [], documents: [] }}
      profile={profile}
      decks={[]}
      syncStatus={{ status: "idle" }}
      globalDeckSettings={undefined}
      onSaveProfile={() => undefined}
      onSaveGlobalLearningSettings={() => undefined}
      onSaveState={() => undefined}
      onSyncNow={() => undefined}
      onListConflicts={() => []}
      onResolveConflict={() => undefined}
      onSignOut={() => undefined}
    />,
  );
}

test("settings expose task-based sections and a read-only login email", () => {
  const html = renderSettings();

  for (const heading of ["Account", "Lernen", "Daten und Sync", "Erweitert"]) {
    assert.match(html, new RegExp(`>${heading}<`));
  }
  assert.match(html, /Login-E-Mail/);
  assert.match(html, /readOnly=""[^>]*value="login@example\.test"/);
  assert.match(html, /Eine Änderung der Login-E-Mail wird derzeit nicht in CoRe angeboten\./);
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
  assert.match(html, /Community- oder Serverrechte/);
  assert.match(html, /vollständiges DSGVO-Auskunftspaket nach Art\. 15/);
  assert.match(html, />Export herunterladen</);
  assert.match(html, />Roh-JSON anzeigen</);
});
