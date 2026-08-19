import React from "react";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Layers,
  Timer,
} from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getLearningDayKey } from "../learningDay.ts";
import {
  type StatisticsDataset,
  type StatisticsDeckSelection,
  type StatisticsPeriod,
  type StatisticsProjection,
} from "../statisticsModel.ts";
import type { StudyHeatmapDay } from "../studyHeatmapModel.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl, EmptyState, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.tsx";
import { InPageNavigation } from "../ui/InPageNavigation.tsx";
import { DeckMultiSelect } from "../ui/selectUi.tsx";
import { StudyHeatmap } from "../ui/StudyHeatmap.tsx";

export interface StatisticsScreenProps {
  decks: StatisticsDataset["decks"];
  queryStatistics: (selection: { period: StatisticsPeriod; deckIds: StatisticsDeckSelection }) => Promise<StatisticsProjection>;
  now: string;
  timeZone: string;
  dayStartHour?: number;
  onNavigate: (viewId: "neue-karten") => unknown;
}

export interface StatisticsScreenContentProps extends Omit<StatisticsScreenProps, "queryStatistics" | "decks"> {
  dataset: StatisticsDataset;
  onSelectionChange?: (selection: { period: StatisticsPeriod; deckIds: StatisticsDeckSelection }) => unknown;
}

const PERIOD_OPTIONS: Array<{ value: StatisticsPeriod; label: string }> = [
  { value: "30d", label: "30 Tage" },
  { value: "90d", label: "90 Tage" },
  { value: "365d", label: "1 Jahr" },
  { value: "all", label: "Gesamt" },
];
const STATISTICS_SECTION_IDS = {
  overview: "statistics-overview",
  activity: "statistics-activity",
  planning: "statistics-planning",
  memory: "statistics-memory-model",
  responses: "statistics-response-behavior",
  comparison: "statistics-deck-comparison",
} as const;
const STATISTICS_SECTIONS = [
  { id: STATISTICS_SECTION_IDS.overview, label: "Überblick", icon: Activity },
  { id: STATISTICS_SECTION_IDS.activity, label: "Lernaktivität", icon: BarChart3 },
  { id: STATISTICS_SECTION_IDS.planning, label: "Planung & Kartenbestand", icon: CalendarDays },
  { id: STATISTICS_SECTION_IDS.memory, label: "FSRS-Gedächtnismodell", icon: BrainCircuit },
  { id: STATISTICS_SECTION_IDS.responses, label: "Antwortverhalten", icon: Timer },
] as const;
const STATISTICS_SECTIONS_WITH_COMPARISON = [
  ...STATISTICS_SECTIONS,
  { id: STATISTICS_SECTION_IDS.comparison, label: "Stapelvergleich", icon: Layers },
] as const;
const CATEGORY_COLORS = {
  learning: "var(--core-action-primary)",
  relearning: "var(--core-danger)",
  young: "var(--core-success)",
  mature: "var(--core-warning)",
};
const PIE_COLORS = [
  "var(--core-action-primary)",
  "var(--core-danger)",
  "var(--core-warning)",
  "var(--core-success)",
  "var(--core-text-muted)",
];
const axisTick = { fill: "var(--core-text-muted)", fontSize: 11 };
const NUMBER_FORMATTERS = [
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }),
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }),
];

type TooltipPayload = Array<{
  name?: string;
  value?: number | string;
  color?: string;
  fill?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}>;

function formatNumber(value: number, maximumFractionDigits = 0) {
  return NUMBER_FORMATTERS[maximumFractionDigits === 0 ? 0 : 1].format(value);
}

function formatPercent(value: number) {
  return `${formatNumber(value, 1)} %`;
}

function formatDuration(milliseconds: number) {
  if (milliseconds <= 0) return "0 Min.";
  const minutes = milliseconds / 60_000;
  if (minutes < 1) return `${Math.round(milliseconds / 1_000)} Sek.`;
  if (minutes < 60) return `${formatNumber(minutes, 1)} Min.`;
  return `${formatNumber(minutes / 60, 1)} Std.`;
}

function formatDate(value: string | null, timeZone: string, dayStartHour = 0) {
  if (!value) return "–";
  const dayKey = getLearningDayKey(value, { timeZone, dayStartHour });
  if (!dayKey) return "–";
  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${dayKey}T12:00:00.000Z`));
}

function formatHeatmapDate(key: string) {
  const [year, month, day] = key.split("-");
  return `${day}.${month}.${year}`;
}

function statisticsHeatmapDayLabel(day: StudyHeatmapDay) {
  const date = formatHeatmapDate(day.key);
  if (day.isOutsideRange) return `${date}: außerhalb des gewählten Zeitraums`;
  if (day.count === 0) return `${date}: keine Wiederholungen`;
  if (day.count === 1) return `${date}: 1 Wiederholung`;
  return `${date}: ${formatNumber(day.count)} Wiederholungen`;
}

function StatisticsTooltip({
  active,
  payload,
  label,
  valueFormatter = (value, entry) => String(entry.dataKey ?? "").toLocaleLowerCase("de-DE").includes("percent") ? formatPercent(value) : formatNumber(value, 1),
}: {
  active?: boolean;
  payload?: TooltipPayload;
  label?: string | number;
  valueFormatter?: (value: number, entry: NonNullable<TooltipPayload>[number]) => string;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload ?? {};
  const heading = String(datum.rangeLabel ?? datum.label ?? label ?? "Details");
  return (
    <div role="tooltip" className="core-overlay min-w-52 rounded-xl border border-[var(--core-border)] bg-core-surface p-3 shadow-xl">
      <p className="core-body font-semibold text-core-text">{heading}</p>
      <div className="mt-2 grid gap-1.5">
        {typeof datum.total === "number" ? (
          <div className="flex items-center justify-between gap-5 border-b border-[var(--core-border)] pb-1.5 core-caption">
            <span className="font-semibold text-core-secondary">Gesamt</span>
            <span className="font-semibold text-core-text">{valueFormatter(datum.total, { name: "Gesamt", dataKey: "total", payload: datum })}</span>
          </div>
        ) : null}
        {payload.filter((entry) => entry.value != null).map((entry) => (
          <div key={`${entry.dataKey}-${entry.name}`} className="flex items-center justify-between gap-5 core-caption">
            <span className="flex items-center gap-2 text-core-secondary">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: entry.color ?? entry.fill }} aria-hidden="true" />
              {entry.name}
            </span>
            <span className="font-semibold text-core-text">{valueFormatter(Number(entry.value), entry)}</span>
          </div>
        ))}
      </div>
      {typeof datum.timedCount === "number" && typeof datum.total === "number" && datum.total > 0 ? (
        <p className="core-caption mt-2 border-t border-[var(--core-border)] pt-2 text-core-muted">
          Zeitmessung: {formatPercent((datum.timedCount / datum.total) * 100)} Abdeckung
        </p>
      ) : null}
    </div>
  );
}

function PanelHeader({ title, titleId, snapshot = false }: { title: string; titleId?: string; snapshot?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h3 id={titleId} tabIndex={titleId ? -1 : undefined} className={`core-heading-3 text-core-text ${titleId ? "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-4" : ""}`.trim()}>{title}</h3>
      {snapshot ? <span className="core-status-label rounded-full bg-core-subtle px-3 py-1.5 text-core-secondary">Stand heute</span> : null}
    </div>
  );
}

function ChartPanel({
  title,
  titleId,
  children,
  snapshot,
  className = "",
}: {
  title: string;
  titleId?: string;
  children: React.ReactNode;
  snapshot?: boolean;
  className?: string;
}) {
  return (
    <SoftPanel className={`p-5 sm:p-6 ${className}`}>
      <PanelHeader title={title} titleId={titleId} snapshot={snapshot} />
      <div className="mt-5 min-w-0">{children}</div>
    </SoftPanel>
  );
}

function StatisticsSectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return <h3 id={id} tabIndex={-1} className="sr-only">{children}</h3>;
}

function NoChartData({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-56 place-items-center rounded-xl bg-core-subtle p-6 text-center core-body text-core-muted">
      <p className="max-w-md">{children}</p>
    </div>
  );
}

function RechartsLegend() {
  return <Legend iconType="square" wrapperStyle={{ color: "var(--core-text-secondary)", fontSize: 12, paddingTop: 14 }} />;
}

function CartesianStatisticsChart({
  data,
  ariaLabel,
  children,
  className = "h-72 w-full",
  minTickGap,
  interval,
  rightAxis,
  tooltip,
}: {
  data: object[];
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  minTickGap?: number;
  interval?: number;
  rightAxis?: "cumulative" | "percent";
  tooltip: React.ReactElement;
}) {
  return (
    <div className={className} aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} accessibilityLayer margin={{ top: 8, right: 10, left: -20, bottom: 10 }}>
          <CartesianGrid stroke="var(--core-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} minTickGap={minTickGap} interval={interval} />
          <YAxis tick={axisTick} allowDecimals={false} />
          {rightAxis === "cumulative" ? <YAxis yAxisId="cumulative" orientation="right" tick={axisTick} allowDecimals={false} /> : null}
          {rightAxis === "percent" ? <YAxis yAxisId="percent" orientation="right" tick={axisTick} domain={[0, 100]} unit=" %" /> : null}
          <Tooltip content={tooltip} />
          <RechartsLegend />
          {children}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActivityChart({ points, duration = false }: { points: StatisticsProjection["activity"]; duration?: boolean }) {
  if (!points.some((point) => duration ? point.durationMs > 0 : point.total > 0)) {
    return <NoChartData>{duration ? "Für diesen Zeitraum wurden noch keine Antwortzeiten gemessen." : "Im gewählten Zeitraum wurden keine Wiederholungen erfasst."}</NoChartData>;
  }
  const data = duration
    ? points.map((point) => ({
        ...point,
        learning: point.durationLearningMs / 60_000,
        relearning: point.durationRelearningMs / 60_000,
        young: point.durationYoungMs / 60_000,
        mature: point.durationMatureMs / 60_000,
        total: point.durationMs / 60_000,
        cumulative: 0,
      }))
    : points;
  if (duration) {
    let cumulative = 0;
    data.forEach((point) => { cumulative += point.total; point.cumulative = cumulative; });
  }
  return (
    <CartesianStatisticsChart
      data={data}
      ariaLabel={duration ? "Diagramm zur Lernzeit" : "Diagramm zu Wiederholungen"}
      className="h-80 w-full"
      minTickGap={28}
      rightAxis="cumulative"
      tooltip={<StatisticsTooltip valueFormatter={(value) => duration ? `${formatNumber(value, 1)} Min.` : formatNumber(value)} />}
    >
      <Bar dataKey="learning" name="Lernen" stackId="reviews" fill={CATEGORY_COLORS.learning} isAnimationActive={false} />
      <Bar dataKey="relearning" name="Wiederlernen" stackId="reviews" fill={CATEGORY_COLORS.relearning} isAnimationActive={false} />
      <Bar dataKey="young" name="Jung" stackId="reviews" fill={CATEGORY_COLORS.young} isAnimationActive={false} />
      <Bar dataKey="mature" name="Reif" stackId="reviews" fill={CATEGORY_COLORS.mature} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      <Area yAxisId="cumulative" dataKey="cumulative" name="Kumuliert" stroke="var(--core-text-muted)" fill="var(--core-action-primary)" fillOpacity={0.08} isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function AddedCardsChart({ points }: { points: StatisticsProjection["addedCards"] }) {
  if (!points.some((point) => point.count > 0)) return <NoChartData>Im gewählten Zeitraum wurden keine Karten hinzugefügt.</NoChartData>;
  return (
    <CartesianStatisticsChart data={points} ariaLabel="Diagramm zu hinzugefügten Karten" minTickGap={28} rightAxis="cumulative" tooltip={<StatisticsTooltip />}>
      <Bar dataKey="count" name="Neu hinzugefügt" fill="var(--core-action-primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      <Line yAxisId="cumulative" dataKey="cumulative" name="Bestand" stroke="var(--core-warning)" strokeWidth={2} dot={false} isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function PlanningChart({ planning }: { planning: StatisticsProjection["planning"] }) {
  if (!planning.points.some((point) => point.total > 0)) return <NoChartData>Für den gewählten Horizont sind keine Wiederholungen eingeplant.</NoChartData>;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Überfällig", value: planning.overdue },
          { label: "Morgen fällig", value: planning.dueTomorrow },
          { label: "Im Horizont", value: planning.dueInHorizon },
          { label: "Arbeitspensum/Tag", value: planning.dailyWorkload },
        ].map(({ label, value }) => (
          <StatTile key={label} size="compact" label={label} value={formatNumber(value, 1)} />
        ))}
      </div>
      <CartesianStatisticsChart data={planning.points} ariaLabel="Diagramm zu geplanten Wiederholungen" className="mt-5 h-72 w-full" minTickGap={28} rightAxis="cumulative" tooltip={<StatisticsTooltip />}>
        <Bar dataKey="learning" name="Lernen" stackId="due" fill={CATEGORY_COLORS.learning} isAnimationActive={false} />
        <Bar dataKey="relearning" name="Wiederlernen/Rückstand" stackId="due" fill={CATEGORY_COLORS.relearning} isAnimationActive={false} />
        <Bar dataKey="young" name="Jung" stackId="due" fill={CATEGORY_COLORS.young} isAnimationActive={false} />
        <Bar dataKey="mature" name="Reif" stackId="due" fill={CATEGORY_COLORS.mature} isAnimationActive={false} />
        <Area yAxisId="cumulative" dataKey="cumulative" name="Kumuliert" stroke="var(--core-text-muted)" fill="var(--core-action-primary)" fillOpacity={0.08} isAnimationActive={false} />
      </CartesianStatisticsChart>
    </>
  );
}

function StatusChart({ status }: { status: StatisticsProjection["status"] }) {
  if (status.activeVariants === 0) return <NoChartData>Die ausgewählten Stapel enthalten keine aktiven, planbaren Varianten.</NoChartData>;
  return (
    <div className="grid items-center gap-5 lg:grid-cols-[minmax(220px,0.8fr)_1fr]">
      <div className="h-64" aria-label="Diagramm zum aktuellen Kartenstatus">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer>
            <Pie data={status.rows} dataKey="count" nameKey="label" innerRadius="53%" outerRadius="82%" paddingAngle={2} isAnimationActive={false}>
              {status.rows.map((row, index) => <Cell key={row.key} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip content={<StatisticsTooltip valueFormatter={(value) => `${formatNumber(value)} Varianten`} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-2">
        {status.rows.map((row, index) => (
          <div key={row.key} className="flex items-center justify-between gap-4 rounded-lg bg-core-subtle px-3 py-2 core-body">
            <span className="flex items-center gap-2 text-core-secondary"><span className="size-3 rounded-sm" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />{row.label}</span>
            <strong className="text-core-text">{formatNumber(row.count)} · {formatPercent(row.percent)}</strong>
          </div>
        ))}
        <p className="core-caption mt-2 text-core-muted">
          {formatNumber(status.learningItems)} Learning Items · {formatNumber(status.suspendedItems)} suspendiert · {formatNumber(status.deletedItems)} gelöscht
        </p>
      </div>
    </div>
  );
}

function DistributionChart({
  points,
  countLabel,
}: {
  points: StatisticsProjection["intervals"]["points"];
  countLabel: string;
  }) {
  if (!points.some((point) => point.count > 0)) return <NoChartData>Für diese Verteilung liegen noch keine geeigneten Werte vor.</NoChartData>;
  return (
    <CartesianStatisticsChart data={points} ariaLabel={`Diagramm zur Verteilung: ${countLabel}`} minTickGap={24} rightAxis="percent" tooltip={<StatisticsTooltip valueFormatter={(value, entry) => entry.dataKey === "cumulativePercent" ? formatPercent(value) : `${formatNumber(value)} ${countLabel}`} />}>
      <Bar dataKey="count" name={countLabel} fill="var(--core-action-primary)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      <Line yAxisId="percent" dataKey="cumulativePercent" name="Kumuliert" stroke="var(--core-warning)" strokeWidth={2} dot={false} isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function HourlyChart({ points }: { points: StatisticsProjection["hourly"] }) {
  if (!points.some((point) => point.reviews > 0)) return <NoChartData>Im gewählten Zeitraum liegen keine Wiederholungen vor.</NoChartData>;
  return (
    <CartesianStatisticsChart data={points} ariaLabel="Diagramm zu Wiederholungen nach Uhrzeit" interval={2} rightAxis="percent" tooltip={<StatisticsTooltip valueFormatter={(value, entry) => entry.dataKey === "successPercent" ? formatPercent(value) : `${formatNumber(value)} Reviews`} />}>
      <Bar dataKey="reviews" name="Wiederholungen" fill="var(--core-action-primary)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      <Line yAxisId="percent" dataKey="successPercent" name="Erfolgsquote" stroke="var(--core-warning)" strokeWidth={2} dot={false} isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function RatingChart({ points }: { points: StatisticsProjection["ratings"] }) {
  if (!points.some((point) => point.total > 0)) return <NoChartData>Im gewählten Zeitraum wurden keine Antwortknöpfe verwendet.</NoChartData>;
  return (
    <CartesianStatisticsChart data={points} ariaLabel="Diagramm zu verwendeten Antwortknöpfen" tooltip={<StatisticsTooltip valueFormatter={(value) => formatNumber(value)} />}>
      <Bar dataKey="again" name="Nochmal" fill="var(--core-danger)" isAnimationActive={false} />
      <Bar dataKey="hard" name="Schwer" fill="var(--core-warning)" isAnimationActive={false} />
      <Bar dataKey="good" name="Gut" fill="var(--core-success)" isAnimationActive={false} />
      <Bar dataKey="easy" name="Einfach" fill="var(--core-action-primary)" isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function RetentionTable({ rows }: { rows: StatisticsProjection["retention"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] border-collapse text-left core-body">
        <thead><tr className="border-b border-[var(--core-border)] text-core-muted"><th className="px-3 py-3">Zeitraum</th><th className="px-3 py-3">Jung</th><th className="px-3 py-3">Reif</th><th className="px-3 py-3">Gesamt</th><th className="px-3 py-3 text-right">Stichprobe</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key} className="border-b border-[var(--core-border)] last:border-0"><th className="px-3 py-3 font-semibold text-core-text">{row.label}</th><td className="px-3 py-3 text-core-secondary">{formatPercent(row.young.percent)}</td><td className="px-3 py-3 text-core-secondary">{formatPercent(row.mature.percent)}</td><td className="px-3 py-3 font-semibold text-core-text">{formatPercent(row.total.percent)}</td><td className="px-3 py-3 text-right text-core-muted">{formatNumber(row.total.total)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function StatisticsScreenContent({ dataset: { decks, projection: statistics }, onSelectionChange, onNavigate, timeZone, dayStartHour = 0 }: StatisticsScreenContentProps) {
  const [isPending, startTransition] = React.useTransition();
  const { period, deckIds: deckSelection } = statistics.selection;
  const showDeckComparison = deckSelection === "all" || statistics.scopeDeckIds.length > 1;
  const statisticsSections = showDeckComparison ? STATISTICS_SECTIONS_WITH_COMPARISON : STATISTICS_SECTIONS;

  function changePeriod(value: StatisticsPeriod) {
    startTransition(() => { onSelectionChange?.({ period: value, deckIds: deckSelection }); });
  }
  function changeDecks(value: StatisticsDeckSelection) {
    startTransition(() => { onSelectionChange?.({ period, deckIds: value }); });
  }

  if (decks.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Lernanalyse" title="Statistik" />
        <EmptyState icon={BarChart3} title="Noch keine Statistik verfügbar" body="Erstelle oder importiere zuerst einen Stapel. Sobald Karten vorhanden sind, zeigt CoRe Planung, FSRS-Zustand und Lernverlauf." action={<ActionButton variant="primary" onClick={() => onNavigate("neue-karten")}>Stapel erstellen</ActionButton>} />
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-8" aria-busy={isPending || undefined}>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <PageHeader eyebrow="Lernanalyse" title="Statistik" />
        <p className="core-body text-core-muted">{statistics.dateRangeLabel}</p>
      </div>

      <SoftPanel className="p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="shrink-0">
            <p className="core-control-label text-core-muted">Globaler Zeitraum</p>
            <CoreSegmentedControl
              ariaLabel="Statistikzeitraum"
              options={PERIOD_OPTIONS}
              value={period}
              onValueChange={changePeriod}
              size="regular"
              className="mt-2"
            />
          </div>
          <div className="min-w-52 flex-1 sm:max-w-72">
            <p className="core-control-label text-core-muted">Stapel</p>
            <div className="mt-2"><DeckMultiSelect decks={decks} value={deckSelection} scopeLabel={statistics.scopeLabel} onValueChange={changeDecks} /></div>
          </div>
        </div>
      </SoftPanel>

      <InPageNavigation ariaLabel="Bereiche der Statistik" items={statisticsSections}>
      <section id={STATISTICS_SECTION_IDS.overview} className="min-w-0" aria-labelledby="statistics-overview-title">
        <ChartPanel title="Überblick" titleId="statistics-overview-title">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile size="compact" label="Reviews" value={formatNumber(statistics.summary.reviewCount)} />
            <StatTile size="compact" label="Erfolgsrate" value={formatPercent(statistics.summary.successPercent)} />
            <StatTile size="compact" label="Wahre Quote" value={statistics.summary.trueRetentionSample > 0 ? formatPercent(statistics.summary.trueRetentionPercent) : "–"} />
            <StatTile size="compact" label="Gemessene Lernzeit" value={formatDuration(statistics.summary.totalDurationMs)} />
            <StatTile size="compact" label="Zeit pro Antwort" value={statistics.summary.timedCount > 0 ? formatDuration(statistics.summary.averageResponseMs) : "–"} />
            <StatTile size="compact" label="Aktive Lerntage" value={formatNumber(statistics.summary.activeDays)} />
            <StatTile size="compact" label="Aktuelle Serie" value={`${formatNumber(statistics.summary.currentStreak)} ${statistics.summary.currentStreak === 1 ? "Tag" : "Tage"}`} />
          </div>
        </ChartPanel>
      </section>

      <section id={STATISTICS_SECTION_IDS.activity} className="grid min-w-0 gap-5 xl:grid-cols-2" aria-labelledby="statistics-activity-title">
        <StatisticsSectionHeading id="statistics-activity-title">Lernaktivität</StatisticsSectionHeading>
        <ChartPanel title="Wiederholungen" className="xl:col-span-2"><ActivityChart points={statistics.activity} /></ChartPanel>
        <ChartPanel title="Lernzeit"><ActivityChart points={statistics.activity} duration /></ChartPanel>
        <ChartPanel title="Hinzugefügte Karten"><AddedCardsChart points={statistics.addedCards} /></ChartPanel>
        <StudyHeatmap heatmap={statistics.studyHeatmap} formatDayLabel={statisticsHeatmapDayLabel} className="xl:col-span-2" />
      </section>

      <section id={STATISTICS_SECTION_IDS.planning} className="grid min-w-0 gap-5 xl:grid-cols-2" aria-labelledby="statistics-planning-title">
        <StatisticsSectionHeading id="statistics-planning-title">Planung & Kartenbestand</StatisticsSectionHeading>
        <ChartPanel title="Zeitplanung" className="xl:col-span-2"><PlanningChart planning={statistics.planning} /></ChartPanel>
        <ChartPanel title="Status" snapshot><StatusChart status={statistics.status} /></ChartPanel>
        <ChartPanel title="Wiederholungsintervalle" snapshot>
          <DistributionChart points={statistics.intervals.points} countLabel="Varianten" />
          <div className="mt-4 grid grid-cols-3 gap-3 text-center core-caption text-core-muted"><span>Mittelwert<br /><strong className="core-body text-core-text">{formatNumber(statistics.intervals.averageDays, 1)} Tage</strong></span><span>Median<br /><strong className="core-body text-core-text">{formatNumber(statistics.intervals.medianDays)} Tage</strong></span><span>95. Perzentil<br /><strong className="core-body text-core-text">{formatNumber(statistics.intervals.percentile95Days)} Tage</strong></span></div>
        </ChartPanel>
      </section>

      <section id={STATISTICS_SECTION_IDS.memory} className="grid min-w-0 gap-5 xl:grid-cols-3" aria-labelledby="statistics-memory-model-title">
        <StatisticsSectionHeading id="statistics-memory-model-title">FSRS-Gedächtnismodell</StatisticsSectionHeading>
        <ChartPanel title="FSRS-Schwierigkeit" snapshot><DistributionChart points={statistics.fsrs.difficulty} countLabel="Varianten" /></ChartPanel>
        <ChartPanel title="FSRS-Stabilität" snapshot><DistributionChart points={statistics.fsrs.stability} countLabel="Varianten" /></ChartPanel>
        <ChartPanel title="Abrufwahrscheinlichkeit" snapshot><DistributionChart points={statistics.fsrs.retrievability} countLabel="Varianten" /></ChartPanel>
      </section>

      <section id={STATISTICS_SECTION_IDS.responses} className="grid min-w-0 gap-5 xl:grid-cols-2" aria-labelledby="statistics-response-behavior-title">
        <StatisticsSectionHeading id="statistics-response-behavior-title">Antwortverhalten</StatisticsSectionHeading>
        <ChartPanel title="Nach Uhrzeit"><HourlyChart points={statistics.hourly} /></ChartPanel>
        <ChartPanel title="Antwortknöpfe"><RatingChart points={statistics.ratings} /></ChartPanel>
        <ChartPanel title="Wahre Erinnerungsquote" className="xl:col-span-2"><RetentionTable rows={statistics.retention} /></ChartPanel>
      </section>

      {showDeckComparison ? <section id={STATISTICS_SECTION_IDS.comparison} className="min-w-0" aria-labelledby="statistics-deck-comparison-title">
        <ChartPanel title="Stapelvergleich" titleId="statistics-deck-comparison-title">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] border-collapse text-left core-body">
              <thead><tr className="border-b border-[var(--core-border)] text-core-muted"><th className="px-3 py-3">Stapel</th><th className="px-3 py-3 text-right">Reviews</th><th className="px-3 py-3 text-right">Erfolg</th><th className="px-3 py-3 text-right">Nochmal</th><th className="px-3 py-3 text-right">Erinnerung</th><th className="px-3 py-3 text-right">Ø Intervall</th><th className="px-3 py-3 text-right">Nächste Fälligkeit</th></tr></thead>
              <tbody>{statistics.deckRows.map((row) => <tr key={row.id} className="border-b border-[var(--core-border)] last:border-0"><th className="px-3 py-3 font-semibold text-core-text"><span className="block">{row.name}</span><span className="core-caption font-normal text-core-muted">{row.path}</span></th><td className="px-3 py-3 text-right text-core-secondary">{formatNumber(row.reviewCount)}</td><td className="px-3 py-3 text-right text-core-secondary">{formatPercent(row.successPercent)}</td><td className="px-3 py-3 text-right text-core-secondary">{formatPercent(row.againPercent)}</td><td className="px-3 py-3 text-right text-core-secondary">{formatPercent(row.trueRetentionPercent)}</td><td className="px-3 py-3 text-right text-core-secondary">{formatNumber(row.averageIntervalDays, 1)} T.</td><td className="px-3 py-3 text-right text-core-secondary">{formatDate(row.nextDueAt, timeZone, dayStartHour)}</td></tr>)}</tbody>
            </table>
          </div>
        </ChartPanel>
      </section> : null}

      </InPageNavigation>
    </div>
  );
}

type StatisticsLoadState =
  | { status: "loading"; dataset: null }
  | { status: "ready"; dataset: StatisticsDataset }
  | { status: "error"; dataset: null };

export function StatisticsScreen({ decks, queryStatistics, now, timeZone, dayStartHour = 0, ...contentProps }: StatisticsScreenProps) {
  const [attempt, setAttempt] = React.useState(0);
  const [loadState, setLoadState] = React.useState<StatisticsLoadState>({ status: "loading", dataset: null });
  const [selection, setSelection] = React.useState<{ period: StatisticsPeriod; deckIds: StatisticsDeckSelection }>({ period: "365d", deckIds: "all" });

  React.useEffect(() => {
    let active = true;
    setLoadState({ status: "loading", dataset: null });
    void Promise.resolve()
      .then(() => queryStatistics(selection))
      .then((projection) => {
        if (active) setLoadState({ status: "ready", dataset: { decks, projection } });
      })
      .catch(() => {
        if (active) setLoadState({ status: "error", dataset: null });
      });
    return () => { active = false; };
  }, [attempt, decks, queryStatistics, selection]);

  if (loadState.status === "ready") {
    return <StatisticsScreenContent {...contentProps} now={now} timeZone={timeZone} dayStartHour={dayStartHour} dataset={loadState.dataset} onSelectionChange={setSelection} />;
  }
  if (loadState.status === "error") {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Lernanalyse" title="Statistik" />
        <EmptyState
          icon={BarChart3}
          title="Statistik konnte nicht geladen werden"
          body="Die lokalen Statistikdaten sind derzeit nicht verfügbar. Versuche es erneut."
          action={<ActionButton variant="primary" onClick={() => setAttempt((value) => value + 1)}>Erneut versuchen</ActionButton>}
        />
      </div>
    );
  }
  return (
    <div className="space-y-8" aria-busy="true">
      <PageHeader eyebrow="Lernanalyse" title="Statistik" />
      <SoftPanel className="p-6" role="status" aria-live="polite">
        <p className="core-body text-core-muted">Statistik wird geladen …</p>
      </SoftPanel>
    </div>
  );
}
