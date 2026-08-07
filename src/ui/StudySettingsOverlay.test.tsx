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
      onOpenChange={() => undefined}
      onEditCard={() => undefined}
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
  assert.match(markup, /Flagge/);
  assert.match(markup, /Markieren/);
  assert.match(markup, /Aussetzen/);
  assert.match(markup, /Pomodoro/);
  assert.match(markup, /Kartenreihenfolge/);
  assert.match(markup, /Neue Karten pro Tag/);
  assert.match(markup, /Max\. Wiederholungen/);
  assert.doesNotMatch(markup, /Kartenverwaltung öffnen|Reset|Mischen|Nur normale Karten|Ansicht/);
});

test("StudySettingsOverlay keeps unfinished actions disabled and exposes bounded steppers", () => {
  const markup = renderOverlay({ canEditCard: false, newCardsPerDay: 0, maximumReviewsPerDay: 500 });

  assert.match(markup, /aria-label="Karte bearbeiten"|>Karte bearbeiten</);
  assert.match(markup, /aria-label="Markieren – noch nicht verfügbar"[^>]*disabled/);
  assert.match(markup, /aria-label="Aussetzen – noch nicht verfügbar"[^>]*disabled/);
  assert.match(markup, /aria-label="Pomodoro: 25 Min\. – noch nicht verfügbar"[^>]*disabled/);
  assert.match(markup, /disabled="" aria-label="Neue Karten pro Tag verringern"/);
  assert.match(markup, /disabled="" aria-label="Max\. Wiederholungen erhöhen"/);
});

test("StudySettingsOverlay renders nothing while closed", () => {
  assert.equal(renderOverlay({ open: false }), "");
});
