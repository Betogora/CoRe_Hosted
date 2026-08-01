import React from "react";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Clock3, Flame, Layers, Target, TrendingUp } from "lucide-react";
import { createPerformanceStatisticsModel } from "../libraryModel.ts";
import { EmptyState, OrbIcon, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.tsx";

function formatPercent(value: number) {
  return `${value} %`;
}

function formatDecimal(value: any) {
  return String(value).replace(".", ",");
}

function formatSeconds(value: number) {
  return value > 0 ? `${formatDecimal(value)} s` : "–";
}

function RatingBreakdown({ rows }: any) {
  return (
    <SoftPanel className="p-7">
      <div className="flex items-start gap-4">
        <OrbIcon icon={Target} className="bg-core-success-soft text-core-text" />
        <div>
          <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Antwortverteilung</h3>
        </div>
      </div>

      <div className="mt-7 grid gap-4">
        {rows.map((row: any) => (
          <div key={row.rating} className="grid gap-2">
            <div className="flex items-center justify-between gap-4 core-body">
              <span className="font-semibold text-[var(--core-text)]">{row.label}</span>
              <span className="font-semibold text-[var(--core-text-muted)]">
                {row.count} · {formatPercent(row.percent)}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--core-surface-muted)]">
              <div className="h-full rounded-full bg-[var(--core-action-secondary)]" style={{ width: `${Math.max(row.percent, row.count > 0 ? 5 : 0)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </SoftPanel>
  );
}

function RecentTrend({ days }: any) {
  const maxReviews = Math.max(1, ...days.map((day: { reviews: any; }) => day.reviews));

  return (
    <SoftPanel className="p-7">
      <div className="flex items-start gap-4">
        <OrbIcon icon={TrendingUp} className="bg-core-success-soft text-core-text" />
        <div>
          <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Letzte 14 Tage</h3>
        </div>
      </div>

      <div className="mt-7 grid h-44 items-end gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((day: { reviews: number; key: React.Key|null|undefined; label: string|any[]; successPercent: any; weakCount: number; successCount: number; }) => {
          const height = day.reviews > 0 ? Math.max(10, Math.round((day.reviews / maxReviews) * 100)) : 4;
          return (
            <div key={day.key} className="flex h-full min-w-0 flex-col justify-end gap-2" title={`${day.label}: ${day.reviews} Reviews, ${formatPercent(day.successPercent)} Trefferquote`}>
              <div className="flex h-full items-end rounded-full bg-[var(--core-surface-muted)]">
                <div
                  className={`w-full rounded-full ${day.weakCount > day.successCount ? "bg-core-warning" : "bg-[var(--core-success)]"}`}
                  style={{ height: `${height}%` }}
                  aria-label={`${day.label}: ${day.reviews} Reviews, ${formatPercent(day.successPercent)} Trefferquote`}
                />
              </div>
              <span className="truncate text-center text-[0.68rem] font-semibold text-[var(--core-text-muted)]">{day.label.slice(0, 2)}</span>
            </div>
          );
        })}
      </div>
    </SoftPanel>
  );
}

function DeckPerformanceRows({ rows }: any) {
  const visibleRows = rows.filter((row: { reviewCount: number; }) => row.reviewCount > 0).slice(0, 8);

  return (
    <SoftPanel className="p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <OrbIcon icon={Layers} className="bg-[var(--core-surface-muted)] text-[var(--core-action-secondary)]" />
          <div>
            <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Stapel-Auswertung</h3>
          </div>
        </div>
      </div>

      {visibleRows.length ? (
        <div className="grid gap-3">
          {visibleRows.map((row: { id: React.Key|null|undefined; name: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; reviewCount: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; dueCards: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; totalCards: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; successPercent: number; weakCount: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; variantReviewCount: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; averageResponseSeconds: any; }) => (
            <div key={row.id} className="rounded-2xl border border-[var(--core-border)] bg-core-surface px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-[14rem] flex-1">
                  <p className="truncate core-body-large font-semibold text-[var(--core-text)]">{row.name}</p>
                  <p className="mt-1 core-body text-[var(--core-text-muted)]">
                    {row.reviewCount} Reviews · {row.dueCards} fällig · {row.totalCards} Karten
                  </p>
                </div>
                <div className="grid min-w-[8rem] gap-1 text-right">
                  <span className="core-heading-3 font-semibold text-[var(--core-text)]">{formatPercent(row.successPercent)}</span>
                  <span className="core-body font-semibold text-[var(--core-text-muted)]">Trefferquote</span>
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--core-surface-muted)]">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--core-success)] to-[var(--core-action-secondary)]" style={{ width: `${Math.max(row.successPercent, 4)}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 core-body font-semibold text-[var(--core-text-muted)]">
                <span>{row.weakCount} schwere Antworten</span>
                <span>{row.variantReviewCount} Varianten-Reviews</span>
                <span>{formatSeconds(row.averageResponseSeconds)} Ø Antwortzeit</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-[var(--core-border)] bg-core-surface px-5 py-6 core-body leading-6 text-[var(--core-text-muted)]">
          Noch keine Stapel mit Reviews. Nach den ersten Lernsessions erscheint hier deine Auswertung pro Stapel.
        </p>
      )}
    </SoftPanel>
  );
}

function WeakDecks({ rows }: any) {
  return (
    <SoftPanel className="p-7">
      <div className="flex items-start gap-4">
        <OrbIcon icon={AlertTriangle} className="bg-core-warning-soft text-core-text" />
        <div>
          <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Aufmerksamkeit</h3>
        </div>
      </div>

      <div className="mt-6 grid min-w-0 gap-3">
        {rows.length ? (
          rows.map((row: { id: React.Key|null|undefined; name: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; weakCount: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; weakPercent: any; }) => (
            <div key={row.id} className="flex min-w-0 w-full max-w-full items-center justify-between gap-4 rounded-2xl border border-[var(--core-border)] bg-core-surface px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate core-body-large font-semibold text-[var(--core-text)]">{row.name}</p>
                <p className="mt-1 core-body text-[var(--core-text-muted)]">{row.weakCount} schwere Antworten</p>
              </div>
              <span className="shrink-0 core-body-large font-semibold text-core-text">{formatPercent(row.weakPercent)}</span>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-[var(--core-border)] bg-core-surface px-5 py-6 core-body leading-6 text-[var(--core-text-muted)]">
            Keine auffälligen Stapel gefunden.
          </p>
        )}
      </div>
    </SoftPanel>
  );
}

export function StatisticsScreen({ decks, onNavigate }: any) {
  const statistics = React.useMemo(() => createPerformanceStatisticsModel(decks), [decks]);
  const { totals } = statistics;

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader
        eyebrow="Statistik"
        title="Leistung auswerten"
      />

      <div className="grid gap-6 lg:grid-cols-4">
        <StatTile icon={Activity} label="Reviews" value={totals.reviewCount} hint={`${totals.activeDays} aktive Tage`} />
        <StatTile icon={CheckCircle2} label="Trefferquote" value={formatPercent(totals.successPercent)} hint={`${formatPercent(totals.strongPercent)} gut oder leicht`} accent="text-core-text" />
        <StatTile icon={Flame} label="Serie" value={`${totals.currentStreak} Tage`} hint={`Bestwert ${totals.longestStreak} Tage`} accent="text-core-text" />
        <StatTile icon={Clock3} label="Antwortzeit" value={formatSeconds(totals.averageResponseSeconds)} hint="Durchschnitt" accent="text-core-text" />
      </div>

      {!statistics.hasReviewEvents ? (
        <EmptyState
          icon={BarChart3}
          title="Noch keine Leistungsdaten"
          body="Sobald du Karten bewertest, zeigt CoRe hier Trefferquote, Serien und Stapel-Auswertungen."
          action={
            <button type="button" onClick={() => onNavigate("lernen")} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[var(--core-action-primary)] px-4 core-body font-semibold text-[var(--core-text-on-accent)]">
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
