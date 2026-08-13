import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudySettingsOverlay } from "./StudySettingsOverlay.tsx";

function renderOverlay(overrides: Partial<React.ComponentProps<typeof StudySettingsOverlay>> = {}) {
  return renderToStaticMarkup(
    <StudySettingsOverlay
      open
      canEditCard
      marked={false}
      suspended={false}
      reviewOrder="reviews-first"
      pomodoroTimer={null}
      onOpenChange={() => undefined}
      onEditCard={() => undefined}
      onEditDeck={() => undefined}
      onMarkedChange={() => undefined}
      onSuspendedChange={() => undefined}
      onReviewOrderChange={() => undefined}
      onStartPomodoro={() => undefined}
      {...overrides}
    />,
  );
}

test("StudySettingsOverlay renders one responsive dialog with the canonical sections and edit links", () => {
  const markup = renderOverlay();

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /core-study-settings-overlay/);
  assert.match(markup, />Karte</);
  assert.match(markup, />Sitzung</);
  assert.match(markup, /Karte bearbeiten/);
  assert.match(markup, /Stapel bearbeiten/);
  assert.doesNotMatch(markup, /Flagge|Flaggenfarben/);
  assert.match(markup, /Markieren/);
  assert.match(markup, /Aussetzen/);
  assert.match(markup, /Pomodoro-Timer/);
  assert.match(markup, /Kartenreihenfolge/);
  assert.match(markup, /Fällige Karten zuerst/);
  assert.match(markup, /aria-label="Aussetzstatus der Karte"/);
  assert.match(markup, />Nicht aussetzen</);
  assert.doesNotMatch(markup, /role="switch"/);
  assert.doesNotMatch(markup, />Stapel</);
  assert.doesNotMatch(markup, /Neue Karten pro Tag|Max\. Wiederholungen/);
  assert.doesNotMatch(markup, /<section class="[^"]*border/);
  assert.doesNotMatch(markup, /Kartenverwaltung öffnen|Reset|Mischen|Nur normale Karten|Ansicht/);
});

test("StudySettingsOverlay keeps deck editing available when card actions are disabled", () => {
  const markup = renderOverlay({ canEditCard: false });
  const deckEditButton = markup.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Stapel bearbeiten(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0];

  assert.match(markup, /aria-label="Karte bearbeiten"|>Karte bearbeiten</);
  assert.ok(deckEditButton);
  assert.doesNotMatch(deckEditButton.match(/^<button[^>]*>/)?.[0] ?? "", /\sdisabled=""/);
  assert.match(markup, /aria-label="Karte markieren"[^>]*disabled/);
  const suspendControl = markup.match(/<div[^>]*aria-label="Aussetzstatus der Karte"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(suspendControl, /aria-pressed="true"[^>]*disabled[^>]*>Nicht aussetzen/);
  assert.match(suspendControl, /aria-pressed="false"[^>]*disabled[^>]*>Aussetzen/);
  assert.match(markup, /Pomodoro-Timer/);
  assert.match(markup, /aria-expanded="false"/);
  assert.doesNotMatch(markup, /Pomodoro[^<]*noch nicht verfügbar/i);
});

test("StudySettingsOverlay renders selected mark and suspended states", () => {
  const markup = renderOverlay({ marked: true, suspended: true });

  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /aria-label="Markierung entfernen"/);
  const suspendControl = markup.match(/<div[^>]*aria-label="Aussetzstatus der Karte"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(suspendControl, /aria-pressed="true"[^>]*>Aussetzen/);
});

test("StudySettingsOverlay shows the persisted mixed card order", () => {
  const markup = renderOverlay({ reviewOrder: "mixed" });

  assert.match(markup, /aria-label="Kartenreihenfolge"/);
  assert.match(markup, /Neue und fällige mischen/);
  assert.doesNotMatch(markup, /Noch nicht verfügbar/);
});

test("StudySettingsOverlay renders nothing while closed", () => {
  assert.equal(renderOverlay({ open: false }), "");
});
