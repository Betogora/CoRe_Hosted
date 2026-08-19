import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreCard, createCoreDeck } from "../coreModel.ts";
import { StatisticsScreen, StatisticsScreenContent } from "./StatisticsScreen.tsx";
import { projectStatistics } from "../statisticsModel.ts";

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
  const selection = { period: "365d" as const, deckIds: "all" as const, now: "2026-08-06T12:00:00.000Z", timeZone: "Europe/Berlin" };
  const markup = renderToStaticMarkup(
    <StatisticsScreenContent
      dataset={{ decks: [deck], projection: projectStatistics([deck], selection) }}
      now="2026-08-06T12:00:00.000Z"
      timeZone="Europe/Berlin"
      onNavigate={() => { throw new Error("navigation is not expected during server rendering"); }}
    />,
  );

  assert.equal((markup.match(/Globaler Zeitraum/g) ?? []).length, 1);
  assert.match(markup, /aria-label="Statistikzeitraum"[^>]*data-size="regular"[^>]*core-segmented-control/);
  assert.match(markup, /Gesamte Sammlung/);
  assert.match(markup, /Wiederholungen/);
  assert.match(markup, /Zeitplanung/);
  assert.equal((markup.match(/<nav aria-label="Bereiche der Statistik"/g) ?? []).length, 2);
  for (const sectionId of [
    "statistics-overview",
    "statistics-activity",
    "statistics-planning",
    "statistics-memory-model",
    "statistics-response-behavior",
    "statistics-deck-comparison",
  ]) {
    assert.equal((markup.match(new RegExp(`href="#${sectionId}"`, "g")) ?? []).length, 2);
    assert.match(markup, new RegExp(`<section id="${sectionId}" class="[^"]*min-w-0`));
  }
  assert.equal((markup.match(/data-size="compact"/g) ?? []).length, 11);
  assert.equal((markup.match(/data-size="default"/g) ?? []).length, 0);
  assert.match(markup, /data-size="compact" class="rounded-xl bg-core-subtle p-3 min-w-0"/);
  const overviewMarkup = markup.match(/<section id="statistics-overview"[\s\S]*?<\/section>/)?.[0];
  assert.ok(overviewMarkup);
  assert.match(overviewMarkup, /core-surface-raised/);
  assert.match(overviewMarkup, /<h3 id="statistics-overview-title"[^>]*>Überblick<\/h3>/);
  assert.match(overviewMarkup, /grid gap-3 sm:grid-cols-4/);
  assert.equal((overviewMarkup.match(/data-size="compact"/g) ?? []).length, 7);
  assert.doesNotMatch(overviewMarkup, /<svg|core-orb/);
  assert.match(markup, /FSRS-Schwierigkeit/);
  assert.match(markup, /Wahre Erinnerungsquote/);
  assert.match(markup, /Stapelvergleich/);
  assert.doesNotMatch(markup, /Schwierige Karten/);
  assert.match(markup, /0 Tage Streak/);
  assert.match(markup, /aria-label="Heatmap-Zeitraum"/);
  assert.match(markup, /data-testid="study-heatmap-grid"/);
  assert.doesNotMatch(markup, /overflow-x-hidden/);
  assert.doesNotMatch(markup, /sticky top-3 z-30 p-4/);
  assert.doesNotMatch(markup, /items-start justify-between gap-3 border-b/);
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

  const singleDeckMarkup = renderToStaticMarkup(
    <StatisticsScreenContent
      dataset={{ decks: [deck], projection: projectStatistics([deck], { ...selection, deckIds: [deck.id] }) }}
      now="2026-08-06T12:00:00.000Z"
      timeZone="Europe/Berlin"
      onNavigate={() => undefined}
    />,
  );
  assert.doesNotMatch(singleDeckMarkup, /href="#statistics-deck-comparison"/);
  assert.doesNotMatch(singleDeckMarkup, /id="statistics-deck-comparison"/);
});

test("statistics screen loads its dataset only after mounting", () => {
  const markup = renderToStaticMarkup(
    <StatisticsScreen
      decks={[]}
      queryStatistics={async (selection) => projectStatistics([], { ...selection, now: "2026-08-06T12:00:00.000Z", timeZone: "Europe/Berlin" })}
      now="2026-08-06T12:00:00.000Z"
      timeZone="Europe/Berlin"
      onNavigate={() => undefined}
    />,
  );

  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /Statistik wird geladen/);
  assert.doesNotMatch(markup, /Globaler Zeitraum/);
  assert.doesNotMatch(markup, /Bereiche der Statistik/);
});
