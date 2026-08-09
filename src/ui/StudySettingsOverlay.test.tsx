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
      newCardsPerDay={20}
      maximumReviewsPerDay={200}
      marked={false}
      suspended={false}
      onOpenChange={() => undefined}
      onEditCard={() => undefined}
      onMarkedChange={() => undefined}
      onSuspendedChange={() => undefined}
      onNewCardsPerDayChange={() => undefined}
      onMaximumReviewsPerDayChange={() => undefined}
      {...overrides}
    />,
  );
}

test("StudySettingsOverlay renders one responsive dialog with the canonical sections", () => {
  const markup = renderOverlay();

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /core-study-settings-overlay/);
  assert.match(markup, />Karte</);
  assert.match(markup, />Sitzung</);
  assert.match(markup, />Stapel</);
  assert.match(markup, /Karte bearbeiten/);
  assert.doesNotMatch(markup, /Flagge|Flaggenfarben/);
  assert.match(markup, /Markieren/);
  assert.match(markup, /Aussetzen/);
  assert.match(markup, /Pomodoro/);
  assert.match(markup, /Kartenreihenfolge/);
  assert.match(markup, /Neue Karten pro Tag/);
  assert.match(markup, /Max\. Wiederholungen/);
  assert.doesNotMatch(markup, /Kartenverwaltung öffnen|Reset|Mischen|Nur normale Karten|Ansicht/);
});

test("StudySettingsOverlay exposes active card state controls and bounded steppers", () => {
  const markup = renderOverlay({ canEditCard: false, newCardsPerDay: 0, maximumReviewsPerDay: 500 });

  assert.match(markup, /aria-label="Karte bearbeiten"|>Karte bearbeiten</);
  assert.match(markup, /aria-label="Karte markieren"[^>]*disabled/);
  assert.match(markup, /role="switch"[^>]*aria-checked="false"[^>]*aria-label="Karte aussetzen"[^>]*disabled/);
  assert.match(markup, /aria-label="Pomodoro: 25 Min\. – noch nicht verfügbar"[^>]*disabled/);
  assert.match(markup, /disabled="" aria-label="Neue Karten pro Tag verringern"/);
  assert.match(markup, /disabled="" aria-label="Max\. Wiederholungen erhöhen"/);
});

test("StudySettingsOverlay renders selected mark and suspended states", () => {
  const markup = renderOverlay({ marked: true, suspended: true });

  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /aria-label="Markierung entfernen"/);
  assert.match(markup, /role="switch"[^>]*aria-checked="true"[^>]*aria-label="Karte reaktivieren"/);
});

test("StudySettingsOverlay renders nothing while closed", () => {
  assert.equal(renderOverlay({ open: false }), "");
});
