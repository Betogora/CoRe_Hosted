import React from "react";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Clock3, Flame, Layers, Target, TrendingUp } from "lucide-react";
import { createPerformanceStatisticsModel } from "../libraryModel.js";
import { EmptyState, OrbIcon, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.jsx";

function formatPercent(value) {
  return `${value} %`;
}

function formatDecimal(value) {
  return String(value).replace(".", ",");
}

function formatSeconds(value) {
  return value > 0 ? `${formatDecimal(value)} s` : "–";
}

function RatingBreakdown({ rows }) {
  return (
    <SoftPanel className="p-7">
      <div className="flex items-start gap-4">
        <OrbIcon icon={Target} className="bg-emerald-50 text-emerald-700" />
        <div>
          <h3 className="text-xl font-semibold text-[#17214f]">Antwortverteilung</h3>
          <p className="mt-2 text-sm leading-6 text-[#66709a]">Wie deine Bewertungen über alle Reviews verteilt sind.</p>
        </div>
      </div>

      <div className="mt-7 grid gap-4">
        {rows.map((row) => (
          <div key={row.rating} className="grid gap-2">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-semibold text-[#17214f]">{row.label}</span>
              <span className="font-semibold text-[#66709a]">
                {row.count} · {formatPercent(row.percent)}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#e8ecf8]">
              <div className="h-full rounded-full bg-[#6270c8]" style={{ width: `${Math.max(row.percent, row.count > 0 ? 5 : 0)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </SoftPanel>
  );
}

function RecentTrend({ days }) {
  const maxReviews = Math.max(1, ...days.map((day) => day.reviews));

  return (
    <SoftPanel className="p-7">
      <div className="flex items-start gap-4">
        <OrbIcon icon={TrendingUp} className="bg-teal-50 text-teal-700" />
        <div>
          <h3 className="text-xl font-semibold text-[#17214f]">Letzte 14 Tage</h3>
          <p className="mt-2 text-sm leading-6 text-[#66709a]">Reviews pro Tag mit Trefferquote im Tagesbalken.</p>
        </div>
      </div>

      <div className="mt-7 grid h-44 items-end gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((day) => {
          const height = day.reviews > 0 ? Math.max(10, Math.round((day.reviews / maxReviews) * 100)) : 4;
          return (
            <div key={day.key} className="flex h-full min-w-0 flex-col justify-end gap-2" title={`${day.label}: ${day.reviews} Reviews, ${formatPercent(day.successPercent)} Trefferquote`}>
              <div className="flex h-full items-end rounded-full bg-[#edf1fb]">
                <div
                  className={`w-full rounded-full ${day.weakCount > day.successCount ? "bg-amber-400" : "bg-[#61b6ad]"}`}
                  style={{ height: `${height}%` }}
                  aria-label={`${day.label}: ${day.reviews} Reviews, ${formatPercent(day.successPercent)} Trefferquote`}
                />
              </div>
              <span className="truncate text-center text-[0.68rem] font-semibold text-[#66709a]">{day.label.slice(0, 2)}</span>
            </div>
          );
        })}
      </div>
    </SoftPanel>
  );
}

function DeckPerformanceRows({ rows }) {
  const visibleRows = rows.filter((row) => row.reviewCount > 0).slice(0, 8);

  return (
    <SoftPanel className="p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <OrbIcon icon={Layers} className="bg-[#eef1fb] text-[#6672bf]" />
          <div>
            <h3 className="text-xl font-semibold text-[#17214f]">Stapel-Auswertung</h3>
            <p className="mt-2 text-sm leading-6 text-[#66709a]">Welche Stapel laufen stabil und wo häufen sich schwere Antworten?</p>
          </div>
        </div>
      </div>

      {visibleRows.length ? (
        <div className="grid gap-3">
          {visibleRows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-[#e3e7f5] bg-white/72 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-[14rem] flex-1">
                  <p className="truncate text-base font-semibold text-[#17214f]">{row.name}</p>
                  <p className="mt-1 text-sm text-[#66709a]">
                    {row.reviewCount} Reviews · {row.dueCards} fällig · {row.totalCards} Karten
                  </p>
                </div>
                <div className="grid min-w-[8rem] gap-1 text-right">
                  <span className="text-xl font-semibold text-[#17214f]">{formatPercent(row.successPercent)}</span>
                  <span className="text-sm font-semibold text-[#66709a]">Trefferquote</span>
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#e8ecf8]">
                <div className="h-full rounded-full bg-gradient-to-r from-[#61b6ad] to-[#6270c8]" style={{ width: `${Math.max(row.successPercent, 4)}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-[#66709a]">
                <span>{row.weakCount} schwere Antworten</span>
                <span>{row.variantReviewCount} Varianten-Reviews</span>
                <span>{formatSeconds(row.averageResponseSeconds)} Ø Antwortzeit</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-[#dce2f4] bg-white/55 px-5 py-6 text-sm leading-6 text-[#66709a]">
          Noch keine Stapel mit Reviews. Nach den ersten Lernsessions erscheint hier deine Auswertung pro Stapel.
        </p>
      )}
    </SoftPanel>
  );
}

function WeakDecks({ rows }) {
  return (
    <SoftPanel className="p-7">
      <div className="flex items-start gap-4">
        <OrbIcon icon={AlertTriangle} className="bg-amber-50 text-amber-700" />
        <div>
          <h3 className="text-xl font-semibold text-[#17214f]">Aufmerksamkeit</h3>
          <p className="mt-2 text-sm leading-6 text-[#66709a]">Stapel mit vielen „Schwer“ oder „Wiederholen“-Bewertungen.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-4 rounded-2xl border border-[#e3e7f5] bg-white/72 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[#17214f]">{row.name}</p>
                <p className="mt-1 text-sm text-[#66709a]">{row.weakCount} schwere Antworten</p>
              </div>
              <span className="shrink-0 text-lg font-semibold text-amber-700">{formatPercent(row.weakPercent)}</span>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-[#dce2f4] bg-white/55 px-5 py-6 text-sm leading-6 text-[#66709a]">
            Keine auffälligen Stapel gefunden.
          </p>
        )}
      </div>
    </SoftPanel>
  );
}

export function StatisticsScreen({ decks, onNavigate }) {
  const statistics = React.useMemo(() => createPerformanceStatisticsModel(decks), [decks]);
  const { totals } = statistics;

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader
        eyebrow="Statistik"
        title="Leistung auswerten"
        body="Trefferquote, Antwortverteilung, Lernserie und Stapel, die mehr Aufmerksamkeit brauchen."
        action={<BarChart3 className="mt-2 text-[#5361aa]" size={24} aria-hidden="true" />}
      />

      <div className="grid gap-6 lg:grid-cols-4">
        <StatTile icon={Activity} label="Reviews" value={totals.reviewCount} hint={`${totals.activeDays} aktive Tage`} />
        <StatTile icon={CheckCircle2} label="Trefferquote" value={formatPercent(totals.successPercent)} hint={`${formatPercent(totals.strongPercent)} gut oder leicht`} accent="text-emerald-700" />
        <StatTile icon={Flame} label="Serie" value={`${totals.currentStreak} Tage`} hint={`Bestwert ${totals.longestStreak} Tage`} accent="text-amber-700" />
        <StatTile icon={Clock3} label="Antwortzeit" value={formatSeconds(totals.averageResponseSeconds)} hint="Durchschnitt" accent="text-teal-700" />
      </div>

      {!statistics.hasReviewEvents ? (
        <EmptyState
          icon={BarChart3}
          title="Noch keine Leistungsdaten"
          body="Sobald du Karten bewertest, zeigt CoRe hier Trefferquote, Serien und Stapel-Auswertungen."
          action={
            <button type="button" onClick={() => onNavigate("lernen")} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white">
              Lernen öffnen
            </button>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <RatingBreakdown rows={statistics.ratingBreakdown} />
        <RecentTrend days={statistics.recentDays} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
        <DeckPerformanceRows rows={statistics.deckRows} />
        <WeakDecks rows={statistics.weakDeckRows} />
      </div>
    </div>
  );
}
