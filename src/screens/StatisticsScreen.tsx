import React from "react";
import {
  BarChart3,
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
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import { getLearningDayKey } from "../learningDay.ts";
import {
  type StatisticsDataset,
  type StatisticsDeckSelection,
  type StatisticsPeriod,
  type StatisticsProjection,
} from "../statisticsModel.ts";
import type { StudyHeatmapDay } from "../studyHeatmapModel.ts";
import type { MaturityBand } from "../coreTypes.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl, EmptyState, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.tsx";
import { CoreTabPanel, CoreTabs, type CoreTab } from "../ui/CoreTabs.tsx";
import { MetricRow } from "../ui/MetricRow.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { DeckMultiSelect } from "../ui/selectUi.tsx";
import { StudyHeatmap } from "../ui/StudyHeatmap.tsx";

export interface StatisticsScreenProps {
  decks: StatisticsDataset["decks"];
  queryStatistics: (selection: { period: StatisticsPeriod; deckIds: StatisticsDeckSelection }) => Promise<StatisticsProjection>;
  now: string;
  timeZone: string;
  dayStartHour?: number;
  onNavigate: (viewId: "neue-karten" | "kartenstapel", options?: { focusedDeckId: string; deckContent: boolean }) => unknown;
}

export interface StatisticsScreenContentProps extends Omit<StatisticsScreenProps, "queryStatistics" | "decks"> {
  dataset: StatisticsDataset;
  selection?: { period: StatisticsPeriod; deckIds: StatisticsDeckSelection };
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onSelectionChange?: (selection: { period: StatisticsPeriod; deckIds: StatisticsDeckSelection }) => unknown;
}

const PERIOD_OPTIONS: Array<{ value: StatisticsPeriod; label: string }> = [
  { value: "30d", label: "30 Tage" },
  { value: "90d", label: "90 Tage" },
  { value: "365d", label: "1 Jahr" },
  { value: "all", label: "Gesamt" },
];
type StatisticsTab = "activity" | "planning" | "memory" | "responses" | "comparison";
const STATISTICS_TABS: ReadonlyArray<CoreTab<StatisticsTab>> = [
  { value: "activity", label: "Lernaktivität" },
  { value: "planning", label: "Planung & Kartenbestand" },
  { value: "memory", label: "FSRS-Gedächtnismodell" },
  { value: "responses", label: "Antwortverhalten" },
];
const STATISTICS_TABS_WITH_COMPARISON: ReadonlyArray<CoreTab<StatisticsTab>> = [...STATISTICS_TABS, { value: "comparison", label: "Stapelvergleich" }];
// Review categories follow the learning-status roles; young intervals are a lighter tint of learned.
const CATEGORY_COLORS = {
  learning: "var(--core-learning-status-in-progress)",
  relearning: "var(--core-learning-status-new)",
  young: "color-mix(in srgb, var(--core-learning-status-learned) 50%, var(--core-surface))",
  mature: "var(--core-learning-status-learned)",
};
const RATING_BUTTONS = [["again", "Nochmal"], ["hard", "Schwer"], ["good", "Gut"], ["easy", "Leicht"]] as const;
const STATUS_COLORS: Record<MaturityBand, string> = {
  new: "var(--core-learning-status-new)",
  learning: CATEGORY_COLORS.learning,
  young: CATEGORY_COLORS.young,
  mature: CATEGORY_COLORS.mature,
};
const axisProps = { tick: { fill: "var(--core-text-muted)", fontSize: 12 }, axisLine: false, tickLine: false, tickMargin: 8 } as const;
const SERIES_PRIMARY = "var(--core-action-primary)";
const SERIES_ACCENT = "var(--core-accent)";
const SERIES_NEUTRAL = "var(--core-text-secondary)";
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

function formatAxisValue(value: number, unit?: string) {
  return unit ? `${formatNumber(value, 1)} ${unit}` : formatNumber(value, 1);
}

// The duration axes pick the largest unit that still shows their maximum as at least two units.
function durationUnit(maxMilliseconds: number) {
  if (maxMilliseconds < 120_000) return { divisor: 1_000, label: "Sek." };
  if (maxMilliseconds < 7_200_000) return { divisor: 60_000, label: "Min." };
  return { divisor: 3_600_000, label: "Std." };
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
    <div role="tooltip" className="core-overlay min-w-52 rounded-control px-3 py-2.5">
      <p className="core-caption font-semibold text-core-text">{heading}</p>
      <div className="mt-2 grid gap-1.5">
        {typeof datum.total === "number" ? (
          <div className="flex items-center justify-between gap-4 border-b border-core-border pb-1.5 core-caption">
            <span className="font-semibold text-core-secondary">Gesamt</span>
            <span className="font-semibold text-core-text">{valueFormatter(datum.total, { name: "Gesamt", dataKey: "total", payload: datum })}</span>
          </div>
        ) : null}
        {payload.filter((entry) => entry.value != null).map((entry) => (
          <div key={`${entry.dataKey}-${entry.name}`} className="flex items-center justify-between gap-4 core-caption">
            <span className="flex items-center gap-2 text-core-secondary">
              <span className="size-2 rounded-round" style={{ backgroundColor: entry.color ?? entry.fill }} aria-hidden="true" />
              {entry.name}
            </span>
            <span className="font-semibold tabular-nums text-core-text">{valueFormatter(Number(entry.value), entry)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartPanel({
  title,
  titleId,
  children,
  className = "",
}: {
  title: string;
  titleId?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <SoftPanel className={`p-5 sm:p-6 ${className}`}>
      <h3 id={titleId} tabIndex={titleId ? -1 : undefined} className={`core-heading-3 text-core-text ${titleId ? "rounded-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-4" : ""}`.trim()}>{title}</h3>
      <div className="mt-5 min-w-0">{children}</div>
    </SoftPanel>
  );
}

function StatisticsSectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return <h3 id={id} tabIndex={-1} className="sr-only">{children}</h3>;
}

function NoChartData({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-56 place-items-center rounded-control border border-dashed border-core-border-strong p-6 text-center core-body text-core-muted">
      <p className="max-w-md">{children}</p>
    </div>
  );
}


function RechartsLegend({ host, order }: { host: HTMLElement | null; order?: readonly string[] }) {
  if (!host) return null;
  return <Legend portal={host} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} {...(order ? { itemSorter: (item: { dataKey?: unknown }) => order.indexOf(String(item.dataKey)) } : {})} formatter={(value) => <span className="text-core-secondary">{value}</span>} />;
}

// Every chart gets the same plot height and its legend below the plot, so neighbouring charts share
// axis heights, grid lines and the legend's top edge however long their legends wrap.
function StatisticsChartFrame({ ariaLabel, className, chart }: { ariaLabel: string; className?: string; chart: (legendHost: HTMLElement | null) => React.ReactElement }) {
  const [legendHost, setLegendHost] = React.useState<HTMLDivElement | null>(null);
  return (
    <div className={className} aria-label={ariaLabel}>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">{chart(legendHost)}</ResponsiveContainer>
      </div>
      <div ref={setLegendHost} className="pt-3" />
    </div>
  );
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// A date series over more than a year shows years on its x axis, ticked and divided where each year starts.
function yearStartKeys(data: object[]) {
  const keys = data.map((point) => (point as { key?: unknown }).key);
  if (keys.length < 2 || !keys.every((key): key is string => typeof key === "string" && DATE_KEY.test(key))) return null;
  if (Date.parse(keys.at(-1)!) - Date.parse(keys[0]) <= 365 * 86_400_000) return null;
  return keys.filter((key, index) => index > 0 && key.slice(0, 4) !== keys[index - 1].slice(0, 4));
}

function CartesianStatisticsChart({
  data,
  ariaLabel,
  children,
  className,
  minTickGap,
  interval,
  rightAxis,
  unit,
  rightUnit = unit,
  tooltip,
}: {
  data: object[];
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  minTickGap?: number;
  interval?: number;
  rightAxis?: "cumulative" | "percent";
  unit?: string;
  rightUnit?: string;
  tooltip: React.ReactElement;
}) {
  const yearStarts = yearStartKeys(data);
  return (
    <StatisticsChartFrame ariaLabel={ariaLabel} className={className} chart={(legendHost) => (
        <ComposedChart data={data} accessibilityLayer margin={{ top: 8, right: 0, left: 0, bottom: 10 }}>
          <CartesianGrid stroke="var(--core-border-interactive)" strokeDasharray="1 5" strokeLinecap="round" vertical={false} />
          {yearStarts
            ? <XAxis dataKey="key" {...axisProps} ticks={yearStarts} minTickGap={8} tickFormatter={(key: string) => key.slice(0, 4)} />
            : <XAxis dataKey="label" {...axisProps} minTickGap={minTickGap} interval={interval} />}
          {yearStarts?.map((key) => <ReferenceLine key={key} x={key} stroke="var(--core-text-muted)" strokeOpacity={0.35} strokeDasharray="3 3" />)}
          <YAxis {...axisProps} width="auto" allowDecimals={false} tickFormatter={(value: number) => formatAxisValue(value, unit)} />
          {rightAxis === "cumulative" ? <YAxis yAxisId="cumulative" orientation="right" {...axisProps} width="auto" allowDecimals={false} tickFormatter={(value: number) => formatAxisValue(value, rightUnit)} /> : null}
          {rightAxis === "percent" ? <YAxis yAxisId="percent" orientation="right" {...axisProps} width="auto" domain={[0, 100]} tickFormatter={(value: number) => formatAxisValue(value, "%")} /> : null}
          <Tooltip content={tooltip} cursor={{ fill: "var(--core-surface-muted)" }} />
          <RechartsLegend host={legendHost} />
          {children}
        </ComposedChart>
    )} />
  );
}

type CategoryKey = keyof typeof CATEGORY_COLORS;
const CATEGORY_KEYS = Object.keys(CATEGORY_COLORS) as CategoryKey[];

// Only the topmost non-empty segment of each stacked bar gets rounded corners.
function stackedCategoryBars(data: Array<Record<CategoryKey, number>>, stackId: string, names: Record<CategoryKey, string>) {
  const topKeys = data.map((point) => [...CATEGORY_KEYS].reverse().find((key) => point[key] > 0));
  return CATEGORY_KEYS.map((key) => (
    <Bar
      key={key}
      dataKey={key}
      name={names[key]}
      stackId={stackId}
      fill={CATEGORY_COLORS[key]}
      isAnimationActive={false}
      shape={(props: BarShapeProps) => <Rectangle {...props} radius={topKeys[props.index] === key ? [3, 3, 0, 0] : 0} />}
    />
  ));
}

function ActivityChart({ points, duration = false }: { points: StatisticsProjection["activity"]; duration?: boolean }) {
  if (!points.some((point) => duration ? point.durationMs > 0 : point.total > 0)) {
    return <NoChartData>{duration ? "Für diesen Zeitraum wurden noch keine Antwortzeiten gemessen." : "Im gewählten Zeitraum wurden keine Wiederholungen erfasst."}</NoChartData>;
  }
  const barUnit = durationUnit(Math.max(...points.map((point) => point.durationMs)));
  const cumulativeUnit = durationUnit(points.reduce((sum, point) => sum + point.durationMs, 0));
  let cumulativeMs = 0;
  const data = duration
    ? points.map((point) => ({
        ...point,
        learning: point.durationLearningMs / barUnit.divisor,
        relearning: point.durationRelearningMs / barUnit.divisor,
        young: point.durationYoungMs / barUnit.divisor,
        mature: point.durationMatureMs / barUnit.divisor,
        total: point.durationMs / barUnit.divisor,
        cumulative: (cumulativeMs += point.durationMs) / cumulativeUnit.divisor,
      }))
    : points;
  return (
    <CartesianStatisticsChart
      data={data}
      ariaLabel={duration ? "Diagramm zur Lernzeit" : "Diagramm zu Wiederholungen"}
      minTickGap={28}
      rightAxis="cumulative"
      unit={duration ? barUnit.label : undefined}
      rightUnit={duration ? cumulativeUnit.label : undefined}
      tooltip={<StatisticsTooltip valueFormatter={(value, entry) => duration ? `${formatNumber(value, 1)} ${entry.dataKey === "cumulative" ? cumulativeUnit.label : barUnit.label}` : formatNumber(value)} />}
    >
      {stackedCategoryBars(data, "reviews", { learning: "Lernen", relearning: "Wiederlernen", young: "Intervall unter 21 Tagen", mature: "Intervall ab 21 Tagen" })}
      <Area yAxisId="cumulative" dataKey="cumulative" name="Kumuliert" stroke={SERIES_NEUTRAL} strokeWidth={1.5} fill="none" isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function AddedCardsChart({ points }: { points: StatisticsProjection["addedCards"] }) {
  if (!points.some((point) => point.count > 0)) return <NoChartData>Im gewählten Zeitraum wurden keine Karten hinzugefügt.</NoChartData>;
  return (
    <CartesianStatisticsChart data={points} ariaLabel="Diagramm zu hinzugefügten Karten" minTickGap={28} rightAxis="cumulative" tooltip={<StatisticsTooltip />}>
      <Bar dataKey="count" name="Neu hinzugefügt" fill={SERIES_PRIMARY} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      <Line yAxisId="cumulative" dataKey="cumulative" name="Bestand" stroke={SERIES_ACCENT} strokeWidth={2} dot={false} isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function PlanningChart({ planning }: { planning: StatisticsProjection["planning"] }) {
  if (!planning.points.some((point) => point.total > 0)) return <NoChartData>Für den gewählten Horizont sind keine Wiederholungen eingeplant.</NoChartData>;
  return (
    <>
      <MetricRow
        items={[
          { label: "Überfällig", value: formatNumber(planning.overdue, 1) },
          { label: "Morgen fällig", value: formatNumber(planning.dueTomorrow, 1) },
          { label: "Im Horizont", value: formatNumber(planning.dueInHorizon, 1) },
          { label: "Arbeitspensum/Tag", value: formatNumber(planning.dailyWorkload, 1) },
        ]}
      />
      <CartesianStatisticsChart data={planning.points} ariaLabel="Diagramm zu geplanten Wiederholungen" className="mt-6" minTickGap={28} rightAxis="cumulative" tooltip={<StatisticsTooltip />}>
        {stackedCategoryBars(planning.points, "due", { learning: "Lernen", relearning: "Wiederlernen/Rückstand", young: "Intervall unter 21 Tagen", mature: "Intervall ab 21 Tagen" })}
        <Area yAxisId="cumulative" dataKey="cumulative" name="Kumuliert" stroke={SERIES_NEUTRAL} strokeWidth={1.5} fill="none" isAnimationActive={false} />
      </CartesianStatisticsChart>
    </>
  );
}

function StatusChart({ status }: { status: StatisticsProjection["status"] }) {
  if (status.activeVariants === 0) return <NoChartData>Die ausgewählten Stapel enthalten keine aktiven, planbaren Karten.</NoChartData>;
  return (
    <div className="grid items-center gap-4 lg:grid-cols-[minmax(220px,0.8fr)_1fr]">
      <div className="h-64" aria-label="Diagramm zum aktuellen Kartenstatus">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer>
            <Pie data={status.rows} dataKey="count" nameKey="label" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="var(--core-surface)" strokeWidth={2} isAnimationActive={false}>
              {status.rows.map((row) => <Cell key={row.key} fill={STATUS_COLORS[row.key]} />)}
            </Pie>
            <Tooltip content={<StatisticsTooltip valueFormatter={(value) => `${formatNumber(value)} Karten`} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid">
        {status.rows.map((row) => (
          <div key={row.key} className="flex min-h-10 items-center justify-between gap-4 border-b border-core-border px-1 core-body">
            <span className="flex items-center gap-2 text-core-secondary"><span className="size-2.5 rounded-round" style={{ backgroundColor: STATUS_COLORS[row.key] }} />{row.label}</span>
            <strong className="tabular-nums text-core-text">{formatNumber(row.count)} · {formatPercent(row.percent)}</strong>
          </div>
        ))}
        <p className="core-caption mt-3 text-core-muted">
          {formatNumber(status.cards)} Karten · {formatNumber(status.suspendedCards)} ausgesetzt · {formatNumber(status.deletedCards)} gelöscht
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
      <Bar dataKey="count" name={countLabel} fill={SERIES_PRIMARY} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      <Line yAxisId="percent" dataKey="cumulativePercent" name="Kumuliert" stroke={SERIES_ACCENT} strokeWidth={2} dot={false} isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function HourlyChart({ points }: { points: StatisticsProjection["hourly"] }) {
  if (!points.some((point) => point.reviews > 0)) return <NoChartData>Im gewählten Zeitraum liegen keine Wiederholungen vor.</NoChartData>;
  return (
    <CartesianStatisticsChart data={points} ariaLabel="Diagramm zu Wiederholungen nach Uhrzeit" interval={2} rightAxis="percent" tooltip={<StatisticsTooltip valueFormatter={(value, entry) => entry.dataKey === "successPercent" ? formatPercent(value) : `${formatNumber(value)} Reviews`} />}>
      <Bar dataKey="reviews" name="Wiederholungen" fill={SERIES_PRIMARY} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      <Line yAxisId="percent" dataKey="successPercent" name="Erfolgsquote" stroke={SERIES_ACCENT} strokeWidth={2} dot={false} isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

// The buttons keep the colours of the study view, so a share reads like the button that was pressed.
const RATING_COLORS = {
  again: "var(--core-rating-again-border)",
  hard: "var(--core-rating-hard-border)",
  good: "var(--core-rating-good-border)",
  easy: "var(--core-rating-easy-border)",
};
const RATING_BAR_SIZE = 22;
const RATING_CATEGORY_LABELS: Record<CategoryKey, string> = { learning: "Lernen", relearning: "Wiederlernen", young: "< 21 Tage", mature: "≥ 21 Tage" };

// The hovered row is outlined around its whole stacked bar instead of crossed by the axis cursor line.
function RatingBarOutline({ points, payload }: { points?: Array<{ x: number; y: number }>; payload?: TooltipPayload }) {
  if (!points || !payload?.[0]?.payload?.total) return null;
  const [start, end] = points;
  return <rect x={start.x - 3} y={start.y - RATING_BAR_SIZE / 2 - 3} width={end.x - start.x + 6} height={RATING_BAR_SIZE + 6} rx={6} fill="none" stroke="var(--core-text-muted)" strokeWidth={1.5} pointerEvents="none" />;
}

/** One bar per review category, split into the share of each button; the tooltip adds the counts. */
function RatingChart({ points }: { points: StatisticsProjection["ratings"] }) {
  if (!points.some((point) => point.total > 0)) return <NoChartData>Im gewählten Zeitraum wurden keine Antwortknöpfe verwendet.</NoChartData>;
  const rows = points.map((point) => ({
    label: RATING_CATEGORY_LABELS[point.category],
    rangeLabel: point.label,
    total: point.total,
    counts: point,
    ...Object.fromEntries(RATING_BUTTONS.map(([rating]) => [rating, point.total ? (point[rating] / point.total) * 100 : 0])),
  }));
  const pressed = points.map((point) => RATING_BUTTONS.filter(([rating]) => point[rating] > 0).map(([rating]) => rating));
  return (
    <StatisticsChartFrame ariaLabel="Diagramm zu verwendeten Antwortknöpfen" chart={(legendHost) => (
        <ComposedChart data={rows} layout="vertical" accessibilityLayer margin={{ top: 8, right: 16, left: 0, bottom: 10 }}>
          <CartesianGrid stroke="var(--core-border-interactive)" strokeDasharray="1 5" strokeLinecap="round" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} {...axisProps} tickFormatter={(value: number) => formatAxisValue(value, "%")} />
          <YAxis type="category" dataKey="label" {...axisProps} width="auto" />
          <Tooltip
            content={<StatisticsTooltip valueFormatter={(value, entry) => entry.dataKey === "total" ? `${formatNumber(value)} Antworten` : `${formatPercent(value)} · ${formatNumber((entry.payload?.counts as Record<string, number>)[String(entry.dataKey)])}`} />}
            cursor={<RatingBarOutline />}
          />
          <RechartsLegend host={legendHost} order={RATING_BUTTONS.map(([rating]) => rating)} />
          {RATING_BUTTONS.map(([rating, label]) => (
            <Bar
              key={rating}
              dataKey={rating}
              name={label}
              stackId="share"
              fill={RATING_COLORS[rating]}
              barSize={RATING_BAR_SIZE}
              isAnimationActive={false}
              shape={(props: BarShapeProps) => {
                const visible = pressed[props.index] ?? [];
                return <Rectangle {...props} radius={[visible[0] === rating ? 3 : 0, visible.at(-1) === rating ? 3 : 0, visible.at(-1) === rating ? 3 : 0, visible[0] === rating ? 3 : 0]} />;
              }}
            />
          ))}
        </ComposedChart>
    )} />
  );
}

function RetentionTable({ rows }: { rows: StatisticsProjection["retention"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] border-collapse text-left core-body tabular-nums">
        <thead><tr className="core-caption text-core-muted"><th className="px-3 py-2.5 font-semibold">Zeitraum</th><th className="px-3 py-2.5 font-semibold">Intervall unter 21 Tagen</th><th className="px-3 py-2.5 font-semibold">Intervall ab 21 Tagen</th><th className="px-3 py-2.5 font-semibold">Gesamt</th><th className="px-3 py-2.5 text-right font-semibold">Stichprobe</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key} className="border-t border-core-border transition-colors hover:bg-core-subtle"><th className="p-3 font-semibold text-core-text">{row.label}</th><td className="p-3 text-core-secondary">{formatPercent(row.young.percent)}</td><td className="p-3 text-core-secondary">{formatPercent(row.mature.percent)}</td><td className="p-3 font-semibold text-core-text">{formatPercent(row.total.percent)}</td><td className="p-3 text-right text-core-muted">{formatNumber(row.total.total)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function StatisticsScreenContent({ dataset: { decks, projection: statistics }, selection, loading = false, error = false, onRetry, onSelectionChange, onNavigate, timeZone, dayStartHour = 0 }: StatisticsScreenContentProps) {
  const periodRef = React.useRef<HTMLDivElement>(null);
  const { period, deckIds: deckSelection } = selection ?? statistics.selection;
  const showDeckComparison = statistics.selection.deckIds === "all" || statistics.scopeDeckIds.length > 1;
  const [tab, setTab] = React.useState<StatisticsTab>("activity");
  const activeTab = tab === "comparison" && !showDeckComparison ? "activity" : tab;

  function changePeriod(value: StatisticsPeriod) {
    onSelectionChange?.({ period: value, deckIds: deckSelection });
  }
  function changeDecks(value: StatisticsDeckSelection) {
    onSelectionChange?.({ period, deckIds: value });
  }

  if (decks.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader title="Statistik" />
        <EmptyState icon={BarChart3} title="Noch keine Statistik verfügbar" body="Erstelle oder importiere zuerst einen Stapel. Sobald Karten vorhanden sind, zeigt CoRe Planung, FSRS-Zustand und Lernverlauf." action={<ActionButton variant="primary" onClick={() => onNavigate("neue-karten")}>Stapel erstellen</ActionButton>} />
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-8">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageHeader title="Statistik" />
          <p className="core-body text-core-muted">{statistics.dateRangeLabel}</p>
        </div>

        <div className="core-statistics-filters">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div ref={periodRef} className="min-w-0 max-w-full shrink-0">
              <CoreSegmentedControl
                ariaLabel="Statistikzeitraum"
                options={PERIOD_OPTIONS}
                value={period}
                onValueChange={changePeriod}
                className="max-w-full"
              />
            </div>
            <div className="min-w-0 max-w-full flex-1 basis-52 sm:max-w-72">
              <DeckMultiSelect decks={decks} value={deckSelection} onValueChange={changeDecks} />
            </div>
          </div>
          <div className="core-statistics-load-track" role={loading ? "progressbar" : undefined} aria-label={loading ? "Statistik wird aktualisiert" : undefined}>
            {loading ? <span aria-hidden="true" /> : null}
          </div>
          <p role="status" aria-live="polite" className="sr-only">{loading ? "Statistik wird aktualisiert." : ""}</p>
        </div>
      </div>

      {error ? <StatusMessage tone="error" announce="assertive" className="rounded-control p-4">
        <p className="core-body">Die Statistik konnte nicht aktualisiert werden. Die angezeigten Daten entsprechen der letzten erfolgreichen Auswahl.</p>
        <ActionButton variant="secondary" className="mt-3" onClick={() => {
          periodRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
          onRetry?.();
        }}>Erneut versuchen</ActionButton>
      </StatusMessage> : null}

      <div className={loading || error ? "opacity-60" : undefined} aria-busy={loading || undefined}>
      <div className="grid min-w-0 gap-6">
      <section className="min-w-0 pb-2" aria-labelledby="statistics-overview-title">
        <StatisticsSectionHeading id="statistics-overview-title">Überblick</StatisticsSectionHeading>
        <MetricRow
          className="core-statistics-overview"
          items={[
            { label: "Reviews", value: formatNumber(statistics.summary.reviewCount) },
            { label: "Erfolgsrate", value: formatPercent(statistics.summary.successPercent) },
            { label: "Wahre Quote", value: statistics.summary.trueRetentionSample > 0 ? formatPercent(statistics.summary.trueRetentionPercent) : "–" },
            { label: "Gemessene Lernzeit", value: formatDuration(statistics.summary.totalDurationMs) },
            { label: "Zeit pro Antwort", value: statistics.summary.timedCount > 0 ? formatDuration(statistics.summary.averageResponseMs) : "–" },
            { label: "Aktive Lerntage", value: formatNumber(statistics.summary.activeDays) },
            { label: "Aktuelle Serie", value: `${formatNumber(statistics.summary.currentStreak)} ${statistics.summary.currentStreak === 1 ? "Tag" : "Tage"}` },
          ]}
        />
      </section>

      <CoreTabs ariaLabel="Bereiche der Statistik" tabs={showDeckComparison ? STATISTICS_TABS_WITH_COMPARISON : STATISTICS_TABS} value={activeTab} onValueChange={setTab} panelId="statistics-area" />
      <CoreTabPanel panelId="statistics-area" value={activeTab} className="min-w-0">
      {activeTab === "activity" ? <section className="grid min-w-0 gap-4 xl:grid-cols-2" aria-labelledby="statistics-activity-title">
        <StatisticsSectionHeading id="statistics-activity-title">Lernaktivität</StatisticsSectionHeading>
        <ChartPanel title="Wiederholungen" className="xl:col-span-2"><ActivityChart points={statistics.activity} /></ChartPanel>
        <ChartPanel title="Lernzeit"><ActivityChart points={statistics.activity} duration /></ChartPanel>
        <ChartPanel title="Hinzugefügte Karten"><AddedCardsChart points={statistics.addedCards} /></ChartPanel>
        <StudyHeatmap heatmap={statistics.studyHeatmap} formatDayLabel={statisticsHeatmapDayLabel} className="xl:col-span-2" />
      </section> : null}

      {activeTab === "planning" ? <section className="grid min-w-0 gap-4 xl:grid-cols-2" aria-labelledby="statistics-planning-title">
        <StatisticsSectionHeading id="statistics-planning-title">Planung & Kartenbestand</StatisticsSectionHeading>
        <ChartPanel title="Zeitplanung" className="xl:col-span-2"><PlanningChart planning={statistics.planning} /></ChartPanel>
        <ChartPanel title="Status"><StatusChart status={statistics.status} /></ChartPanel>
        <ChartPanel title="Wiederholungsintervalle">
          <DistributionChart points={statistics.intervals.points} countLabel="Karten" />
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-core-border pt-4 text-center core-caption text-core-muted"><span>Mittelwert<br /><strong className="core-heading-3 tabular-nums text-core-text">{formatNumber(statistics.intervals.averageDays, 1)} Tage</strong></span><span>Median<br /><strong className="core-heading-3 tabular-nums text-core-text">{formatNumber(statistics.intervals.medianDays)} Tage</strong></span><span>95. Perzentil<br /><strong className="core-heading-3 tabular-nums text-core-text">{formatNumber(statistics.intervals.percentile95Days)} Tage</strong></span></div>
        </ChartPanel>
      </section> : null}

      {activeTab === "memory" ? <section className="grid min-w-0 gap-4 xl:grid-cols-3" aria-labelledby="statistics-memory-model-title">
        <StatisticsSectionHeading id="statistics-memory-model-title">FSRS-Gedächtnismodell</StatisticsSectionHeading>
        <ChartPanel title="FSRS-Schwierigkeit"><DistributionChart points={statistics.fsrs.difficulty} countLabel="Karten" /></ChartPanel>
        <ChartPanel title="FSRS-Stabilität"><DistributionChart points={statistics.fsrs.stability} countLabel="Karten" /></ChartPanel>
        <ChartPanel title="Abrufwahrscheinlichkeit"><DistributionChart points={statistics.fsrs.retrievability} countLabel="Karten" /></ChartPanel>
      </section> : null}

      {activeTab === "responses" ? <section className="grid min-w-0 gap-4 xl:grid-cols-2" aria-labelledby="statistics-response-behavior-title">
        <StatisticsSectionHeading id="statistics-response-behavior-title">Antwortverhalten</StatisticsSectionHeading>
        <ChartPanel title="Nach Uhrzeit"><HourlyChart points={statistics.hourly} /></ChartPanel>
        <ChartPanel title="Antwortknöpfe"><RatingChart points={statistics.ratings} /></ChartPanel>
        <ChartPanel title="Wahre Erinnerungsquote" className="xl:col-span-2"><RetentionTable rows={statistics.retention} /></ChartPanel>
      </section> : null}

      {activeTab === "comparison" ? <section className="min-w-0" aria-labelledby="statistics-deck-comparison-title">
        <ChartPanel title="Stapelvergleich" titleId="statistics-deck-comparison-title" className="core-deck-comparison-container">
          <table className="core-deck-comparison w-full border-collapse text-left core-body">
            <thead><tr><th scope="col">Stapel</th><th scope="col">Reviews</th><th scope="col">Erfolg</th><th scope="col">Nochmal</th><th scope="col">Erinnerung</th><th scope="col">Ø Intervall</th><th scope="col">Nächste Fälligkeit</th></tr></thead>
            <tbody>{statistics.deckRows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <button type="button" className="min-h-control w-full text-left font-semibold text-core-text [overflow-wrap:anywhere] hover:text-core-action" aria-label={`Stapelinhalte öffnen: ${row.name}`} onClick={() => onNavigate("kartenstapel", { focusedDeckId: row.id, deckContent: true })}>{row.name}</button>
                </th>
                <td><StatTile size="compact" variant="plain" label="Reviews" value={formatNumber(row.reviewCount)} /></td>
                <td><StatTile size="compact" variant="plain" label="Erfolg" value={formatPercent(row.successPercent)} /></td>
                <td><StatTile size="compact" variant="plain" label="Nochmal" value={formatPercent(row.againPercent)} /></td>
                <td><StatTile size="compact" variant="plain" label="Erinnerung" value={formatPercent(row.trueRetentionPercent)} /></td>
                <td><StatTile size="compact" variant="plain" label="Ø Intervall" value={`${formatNumber(row.averageIntervalDays, 1)} T.`} /></td>
                <td><StatTile size="compact" variant="plain" label="Nächste Fälligkeit" value={formatDate(row.nextDueAt, timeZone, dayStartHour)} /></td>
              </tr>
            ))}</tbody>
          </table>
        </ChartPanel>
      </section> : null}
      </CoreTabPanel>
      </div>
      </div>
    </div>
  );
}

type StatisticsLoadState =
  | { status: "loading" | "error"; dataset: StatisticsDataset | null }
  | { status: "ready"; dataset: StatisticsDataset };

export function StatisticsScreen({ decks, queryStatistics, now, timeZone, dayStartHour = 0, ...contentProps }: StatisticsScreenProps) {
  const [attempt, setAttempt] = React.useState(0);
  const [loadState, setLoadState] = React.useState<StatisticsLoadState>({ status: "loading", dataset: null });
  const [selection, setSelection] = React.useState<{ period: StatisticsPeriod; deckIds: StatisticsDeckSelection }>({ period: "365d", deckIds: "all" });

  React.useEffect(() => {
    let active = true;
    setLoadState((current) => ({ ...current, status: "loading" }));
    void Promise.resolve()
      .then(() => queryStatistics(selection))
      .then((projection) => {
        if (active) setLoadState({ status: "ready", dataset: { decks, projection } });
      })
      .catch(() => {
        if (active) setLoadState((current) => ({ ...current, status: "error" }));
      });
    return () => { active = false; };
  }, [attempt, decks, queryStatistics, selection]);

  if (loadState.dataset) {
    return <StatisticsScreenContent {...contentProps} now={now} timeZone={timeZone} dayStartHour={dayStartHour} dataset={loadState.dataset} selection={selection} loading={loadState.status === "loading"} error={loadState.status === "error"} onRetry={() => setAttempt((value) => value + 1)} onSelectionChange={setSelection} />;
  }
  if (loadState.status === "error") {
    return (
      <div className="space-y-8">
        <PageHeader title="Statistik" />
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
      <PageHeader title="Statistik" />
      <SoftPanel className="p-6" role="status" aria-live="polite">
        <p className="core-body text-core-muted">Statistik wird geladen …</p>
      </SoftPanel>
    </div>
  );
}
