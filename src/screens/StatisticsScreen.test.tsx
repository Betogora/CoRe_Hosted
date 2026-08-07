import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreCard, createCoreDeck } from "../coreModel.ts";
import { StatisticsScreen } from "./StatisticsScreen.tsx";

test("statistics screen exposes one global filter and the complete CoRe analysis sections", () => {
  const card = createCoreCard({
    id: "card_statistics_screen",
    source: "manual",
    originalFront: "Frage",
    originalBack: "Antwort",
    reviewState: {
      state: "review",
      dueAt: "2026-08-07T08:00:00.000Z",
      intervalDays: 25,
      difficulty: 5,
      stability: 20,
      reps: 4,
      repetitions: 4,
      lastReviewedAt: "2026-08-05T08:00:00.000Z",
    },
  });
  const deck = createCoreDeck({ id: "deck_statistics_screen", name: "Biologie", source: "manual", cards: [card] });
  const markup = renderToStaticMarkup(
    <StatisticsScreen
      decks={[deck]}
      now="2026-08-06T12:00:00.000Z"
      timeZone="Europe/Berlin"
      onNavigate={() => { throw new Error("navigation is not expected during server rendering"); }}
      onStartDeck={() => undefined}
      onOpenCard={() => undefined}
    />,
  );

  assert.equal((markup.match(/Globaler Zeitraum/g) ?? []).length, 1);
  assert.match(markup, /Gesamte Sammlung/);
  assert.match(markup, /Wiederholungen/);
  assert.match(markup, /Zeitplanung/);
  assert.match(markup, /FSRS-Schwierigkeit/);
  assert.match(markup, /Wahre Erinnerungsquote/);
  assert.match(markup, /Stapelvergleich/);
  assert.match(markup, /Lern-Heatmap/);
  assert.match(markup, /data-testid="study-heatmap-grid"/);
  assert.doesNotMatch(markup, /overflow-x-hidden/);
  for (const removedText of [
    "Alle historischen Diagramme",
    "pro aktivem Tag",
    "Schwer, Gut oder Einfach",
    "geeignete Reviews",
    "Messung beginnt mit der nächsten Wiederholung",
    "gemessene Antworten",
    "Längste:",
    "Auswertung",
    "Durchgeführte Reviews nach Zustand",
    "Neue Learning Items und kumulierter Bestand",
    "Direkter Vergleich innerhalb der globalen Auswahl",
    "FSRS-Kennzahlen und aktuelle Bestandsverteilungen",
  ]) assert.doesNotMatch(markup, new RegExp(removedText));
  assert.doesNotMatch(markup, /Letzte 14 Tage/);
});
