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
  const projection = projectStatistics([deck], selection);
  projection.summary.currentStreak = 1;
  const markup = renderToStaticMarkup(
    <StatisticsScreenContent
      dataset={{ decks: [deck], projection }}
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
    assert.match(markup, new RegExp(`<section id="${sectionId}"`));
  }
  const overviewMarkup = markup.match(/<section id="statistics-overview"[\s\S]*?<\/section>/)?.[0];
  assert.ok(overviewMarkup);
  assert.match(overviewMarkup, /<h3 id="statistics-overview-title"[^>]*>Überblick<\/h3>/);
  assert.match(overviewMarkup, /Reviews/);
  assert.doesNotMatch(overviewMarkup, /Wiederholungen/);
  assert.match(overviewMarkup, /Erfolgsrate/);
  assert.doesNotMatch(overviewMarkup, /Erfolgsquote/);
  assert.match(overviewMarkup, /Wahre Quote/);
  assert.doesNotMatch(overviewMarkup, /Erinnerungsquote/);
  assert.match(overviewMarkup, /1 Tag/);
  assert.match(markup, /FSRS-Schwierigkeit/);
  assert.match(markup, /Wahre Erinnerungsquote/);
  assert.match(markup, /Stapelvergleich/);
  assert.match(markup, /aria-label="Stapelmenü öffnen: Biologie"/);
  assert.match(markup, /scope="row"/);
  assert.doesNotMatch(markup, /Schwierige Karten/);
  assert.match(markup, /0 Tage Streak/);
  assert.match(markup, /aria-label="Heatmap-Zeitraum"/);
  assert.match(markup, /data-testid="study-heatmap-grid"/);
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

test("statistics refresh keeps previous results and shows the requested filter with an indeterminate inline bar", () => {
  const deck = createCoreDeck({ id: "refresh_deck", name: "Biologie", source: "manual", cards: [createCoreCard({ id: "refresh_card", source: "manual", originalFront: "Frage", originalBack: "Antwort" })] });
  const dataset = { decks: [deck], projection: projectStatistics([deck], { period: "365d", deckIds: "all", now: "2026-09-30T12:00:00.000Z", timeZone: "Europe/Berlin" }) };
  dataset.projection.summary.reviewCount = 42;
  const render = (loading: boolean, error = false) => renderToStaticMarkup(<StatisticsScreenContent dataset={dataset} selection={{ period: "90d", deckIds: [deck.id] }} loading={loading} error={error} onRetry={() => undefined} now="2026-09-30T12:00:00.000Z" timeZone="Europe/Berlin" onNavigate={() => undefined} />);
  const pending = render(true);
  assert.match(pending, /aria-pressed="true"[^>]*>90 Tage<\/button>/);
  assert.match(pending, /Stapel filtern\. Aktuell: Biologie/);
  assert.match(pending, /core-statistics-load-track" role="progressbar" aria-label="Statistik wird aktualisiert"/);
  assert.doesNotMatch(pending, /aria-valuenow|Statistik wird geladen/);
  assert.match(pending, /class="opacity-60" aria-busy="true"/);
  assert.match(pending, />42<\/dd>/);
  assert.match(pending, /href="#statistics-deck-comparison"/);
  assert.match(pending, /class="sr-only">Statistik wird aktualisiert\./);
  const ready = render(false);
  assert.match(ready, /class="core-statistics-load-track"><\/div>/);
  assert.doesNotMatch(ready, /role="progressbar"|opacity-60|aria-busy="true"/);
  const failed = render(false, true);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /letzten erfolgreichen Auswahl/);
  assert.match(failed, /Erneut versuchen/);
  assert.match(failed, />42<\/dd>/);
  assert.doesNotMatch(failed, /role="progressbar"|Statistik wird geladen/);
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
